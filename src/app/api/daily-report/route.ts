import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import Groq from 'groq-sdk'
import path from 'path'
import fs from 'fs'

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']

function setCell(ws: XLSX.WorkSheet, addr: string, value: string | number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing: any = ws[addr] ?? {}
  const t: XLSX.ExcelDataType = typeof value === 'number' ? 'n' : 's'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cell: any = { ...existing, v: value, t, w: String(value) }
  delete cell.f
  ws[addr] = cell
}

function bathingText(record: { bathing: string; bathingSkipReason: string | null }): string {
  if (record.bathing === 'DONE') return '実施'
  if (record.bathing === 'NOT_DONE') {
    const reason = record.bathingSkipReason ?? '理由不明'
    return '未実施（' + reason + '）'
  }
  return '対象外'
}

export async function GET(request: Request) {
  await requireSession()

  const { searchParams } = new URL(request.url)
  const residentId = searchParams.get('residentId') ?? ''
  const date = searchParams.get('date') ?? ''

  if (!residentId || !date) {
    return new Response('Missing residentId or date', { status: 400 })
  }

  const [{ data: resident }, { data: record }] = await Promise.all([
    supabase.from('Resident').select('*').eq('id', residentId).single(),
    supabase.from('DailyRecord').select('*').eq('residentId', residentId).eq('date', date).maybeSingle(),
  ])

  if (!resident) return new Response('Resident not found', { status: 404 })

  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(date + 'T00:00:00').getDay()
  const reiwaYear = y - 2018

  // AI text generation
  let aiDailyNotes = ''
  let aiRehabNotes = ''
  const apiKey = process.env.GROQ_API_KEY

  if (apiKey && record) {
    const totalFluid = (record.fluidIntakeAm ?? 0) + (record.fluidIntakePm ?? 0)
    const lunchMed = record.medicationBeforeLunch || record.medicationAfterLunch

    const bpAm = record.bpSystolic != null
      ? record.bpSystolic + '/' + record.bpDiastolic
      : '未測定'
    const bpPm = record.bpSystolicPm != null
      ? record.bpSystolicPm + '/' + record.bpDiastolicPm
      : '未測定'
    const trainingTime = record.functionalTrainingStart
      ? record.functionalTrainingStart + '-' + (record.functionalTrainingEnd ?? '')
      : ''

    const lines = [
      '利用者名: ' + resident.name,
      '日付: ' + y + '年' + m + '月' + d + '日（' + DOW_JA[dow] + '曜日）',
      '体温: 午前 ' + (record.tempMorning ?? '未測定') + '℃ / 午後 ' + (record.tempAfternoon ?? '未測定') + '℃',
      '血圧: 午前 ' + bpAm + ' / 午後 ' + bpPm + ' mmHg',
      '脈拍: 午前 ' + (record.pulse ?? '未測定') + ' / 午後 ' + (record.pulsePm ?? '未測定') + ' 回/分',
      '食事: 主食 ' + (record.mealMainFood != null ? record.mealMainFood + '割' : '未記録') + ' 副食 ' + (record.mealSideFood != null ? record.mealSideFood + '割' : '未記録'),
      '水分: 計 ' + totalFluid + 'ml（午前 ' + (record.fluidIntakeAm ?? 0) + 'ml + 午後 ' + (record.fluidIntakePm ?? 0) + 'ml）',
      '入浴: ' + bathingText(record),
      '口腔ケア: ' + (record.oralCare ? '実施' : '未実施'),
      '服薬: 朝' + (record.medicationMorning ? '有' : '無') + ' 昼' + (lunchMed ? '有' : '無') + ' 夕' + (record.medicationEvening ? '有' : '無'),
      '機能訓練: ' + (record.trainingDone ? '実施' + (trainingTime ? '（' + trainingTime + '）' : '') : '未実施'),
      record.specialNotes ? '特記事項: ' + record.specialNotes : '',
      resident.specialCondition ? '利用者特記: ' + resident.specialCondition : '',
    ].filter(Boolean).join('\n')

    const dailyPrompt = 'あなたはデイサービスの介護記録担当スタッフです。以下の当日記録をもとに「日中のご様子・連絡事項」欄の文章を自然な介護記録文体で３〜５文で作成してください。文章のみ出力してください。\n\n' + lines
    const rehabPrompt = 'あなたはデイサービスの機能訓練担当スタッフです。以下の訓練記録をもとに「リハビリからの連絡事項」欄の文章を自然な記録文体で１〜２文で作成してください。文章のみ出力してください。\n\n' + lines

    try {
      const client = new Groq({ apiKey })
      const [daily, rehab] = await Promise.all([
        client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 400,
          messages: [{ role: 'user', content: dailyPrompt }],
        }),
        record.trainingDone
          ? client.chat.completions.create({
              model: 'llama-3.3-70b-versatile',
              max_tokens: 200,
              messages: [{ role: 'user', content: rehabPrompt }],
            })
          : Promise.resolve(null),
      ])
      aiDailyNotes = daily.choices[0]?.message?.content ?? ''
      aiRehabNotes = rehab?.choices[0]?.message?.content ?? ''
    } catch (err) {
      console.error('[daily-report] Groq error:', err)
    }
  }

  // Load template
  const templatePath = path.join(process.cwd(), 'public', 'daily-report-template.xlsx')
  const wb = XLSX.read(fs.readFileSync(templatePath), { type: 'buffer', cellStyles: true })
  const ws = wb.Sheets[wb.SheetNames[0]]

  // Fill date (row 1)
  setCell(ws, 'J1', reiwaYear)
  setCell(ws, 'L1', m)
  setCell(ws, 'N1', d)
  setCell(ws, 'P1', DOW_JA[dow] + '曜日')

  if (record) {
    // AM vitals (row 5)
    if (record.tempMorning != null)  setCell(ws, 'I5', record.tempMorning)
    if (record.bpSystolic != null)   setCell(ws, 'L5', record.bpSystolic + '/' + (record.bpDiastolic ?? '?'))
    if (record.pulse != null)        setCell(ws, 'O5', record.pulse)

    // PM vitals (row 6)
    if (record.tempAfternoon != null) setCell(ws, 'I6', record.tempAfternoon)
    if (record.bpSystolicPm != null)  setCell(ws, 'L6', record.bpSystolicPm + '/' + (record.bpDiastolicPm ?? '?'))
    if (record.pulsePm != null)       setCell(ws, 'O6', record.pulsePm)

    // Food / fluid (row 7)
    if (record.mealMainFood != null) setCell(ws, 'H7', record.mealMainFood + '割')
    if (record.mealSideFood != null) setCell(ws, 'K7', record.mealSideFood + '割')
    const totalFluid = (record.fluidIntakeAm ?? 0) + (record.fluidIntakePm ?? 0)
    if (totalFluid > 0) setCell(ws, 'O7', totalFluid + 'ml')

    // Bathing / oral care (row 8)
    setCell(ws, 'F8', record.bathing === 'DONE' ? '有' : '無')
    setCell(ws, 'N8', record.oralCare ? '有' : '無')

    // Medication (row 9)
    const lunchMed = record.medicationBeforeLunch || record.medicationAfterLunch
    setCell(ws, 'G9', record.medicationMorning ? '有' : '無')
    setCell(ws, 'J9', lunchMed ? '有' : '無')
    setCell(ws, 'M9', record.medicationEvening ? '有' : '無')

    // Training (row 11)
    if (record.trainingDone) {
      if (record.functionalTrainingStart) setCell(ws, 'K11', record.functionalTrainingStart)
      if (record.functionalTrainingEnd)   setCell(ws, 'O11', record.functionalTrainingEnd)
    }

    // AI-generated text
    if (aiDailyNotes) setCell(ws, 'B15', aiDailyNotes)
    if (aiRehabNotes) setCell(ws, 'B21', aiRehabNotes)
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
  const filename = '日報_' + resident.name + '_' + date + '.xlsx'

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(filename),
    },
  })
}
