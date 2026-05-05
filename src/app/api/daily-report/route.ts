import { requireSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import Groq from 'groq-sdk'
import path from 'path'
import fs from 'fs'
import type { Resident, DailyRecord } from '@/types/database'

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

function addHoursToTime(timeStr: string, hours: number): string {
  const parts = timeStr.split(':')
  const h = parseInt(parts[0])
  const mn = parseInt(parts[1] ?? '0')
  const total = h * 60 + mn + hours * 60
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0')
}

function bathingLabel(bathing: string, skipReason: string | null): string {
  if (bathing === 'DONE') return '有'
  if (bathing === 'NOT_DONE') return '無（' + (skipReason ?? '理由不明') + '）'
  return '対象外'
}

function sheetSafeName(name: string): string {
  return name.replace(/[:\\/?\[\]]/g, '').slice(0, 31)
}

async function generateAIText(
  client: Groq,
  resident: Resident,
  record: DailyRecord,
  dateStr: string,
): Promise<{ daily: string; rehab: string }> {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = new Date(dateStr + 'T00:00:00').getDay()
  const totalFluid = (record.fluidIntakeAm ?? 0) + (record.fluidIntakePm ?? 0)
  const lunchMed = record.medicationBeforeLunch || record.medicationAfterLunch
  const bpAm = record.bpSystolic != null ? record.bpSystolic + '/' + record.bpDiastolic : '未測定'
  const bpPm = record.bpSystolicPm != null ? record.bpSystolicPm + '/' + record.bpDiastolicPm : '未測定'
  const trainingTime = record.functionalTrainingStart
    ? record.functionalTrainingStart + '-' + (record.functionalTrainingEnd ?? '')
    : ''

  const context = [
    '利用者名: ' + resident.name,
    resident.careLevel ? '要介護区分: ' + resident.careLevel : '',
    '日付: ' + y + '年' + m + '月' + d + '日（' + DOW_JA[dow] + '曜日）',
    '体温: 午前 ' + (record.tempMorning ?? '未測定') + '℃ / 午後 ' + (record.tempAfternoon ?? '未測定') + '℃',
    '血圧: 午前 ' + bpAm + ' / 午後 ' + bpPm + ' mmHg',
    '脈拍: 午前 ' + (record.pulse ?? '未測定') + ' / 午後 ' + (record.pulsePm ?? '未測定') + ' 回/分',
    '食事: 主食 ' + (record.mealMainFood != null ? record.mealMainFood + '割' : '未記録') + ' 副食 ' + (record.mealSideFood != null ? record.mealSideFood + '割' : '未記録'),
    '水分: 計 ' + totalFluid + 'ml（午前 ' + (record.fluidIntakeAm ?? 0) + 'ml + 午後 ' + (record.fluidIntakePm ?? 0) + 'ml）',
    '入浴: ' + bathingLabel(record.bathing, record.bathingSkipReason),
    '口腔ケア: ' + (record.oralCare ? '実施' : '未実施'),
    '服薬: 朝' + (record.medicationMorning ? '有' : '無') + ' 昼' + (lunchMed ? '有' : '無') + ' 夕' + (record.medicationEvening ? '有' : '無'),
    '機能訓練: ' + (record.trainingDone ? '実施' + (trainingTime ? '（' + trainingTime + '）' : '') : '未実施'),
    record.specialNotes ? '特記事項: ' + record.specialNotes : '',
    resident.specialCondition ? '利用者特記: ' + resident.specialCondition : '',
  ].filter(Boolean).join('\n')

  const [dailyRes, rehabRes] = await Promise.all([
    client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: 'あなたはデイサービスの介護記録担当スタッフです。以下の当日記録をもとに「日中のご様子・連絡事項」欄の文章を自然な介護記録文体で３〜５文で作成してください。文章のみ出力してください。\n\n' + context,
      }],
    }),
    record.trainingDone
      ? client.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: 'あなたはデイサービスの機能訓練担当スタッフです。以下の訓練記録をもとに「リハビリからの連絡事項」欄の文章を自然な記録文体で１〜２文で作成してください。文章のみ出力してください。\n\n' + context,
          }],
        })
      : Promise.resolve(null),
  ])

  return {
    daily: dailyRes.choices[0]?.message?.content ?? '',
    rehab: rehabRes?.choices[0]?.message?.content ?? '',
  }
}

function fillSheet(
  ws: XLSX.WorkSheet,
  resident: Resident,
  record: DailyRecord | null,
  date: string,
  aiDaily: string,
  aiRehab: string,
) {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(date + 'T00:00:00').getDay()
  const reiwaYear = y - 2018

  const startTime = resident.serviceStartTime ?? '9:30'
  const category = resident.serviceTimeCategory ?? ''
  const categoryHours = category ? parseInt(category.split('-')[0]) : 0
  const endTime = categoryHours > 0 ? addHoursToTime(startTime, categoryHours) : ''

  // 名前
  setCell(ws, 'A1', resident.name + '　様')

  // 日付
  setCell(ws, 'I1', reiwaYear)
  setCell(ws, 'K1', m)
  setCell(ws, 'M1', d)
  setCell(ws, 'O1', DOW_JA[dow] + '曜日')

  // サービス提供時間
  setCell(ws, 'G2', startTime)
  if (endTime) setCell(ws, 'J2', endTime)
  if (category) setCell(ws, 'N2', category + '時間')

  if (!record) return

  // AM バイタル（行5）
  setCell(ws, 'E5', '9:30')
  if (record.tempMorning != null)  setCell(ws, 'H5', record.tempMorning)
  if (record.bpSystolic != null)   setCell(ws, 'K5', record.bpSystolic + '/' + (record.bpDiastolic ?? '?'))
  if (record.pulse != null)        setCell(ws, 'N5', record.pulse)

  // PM バイタル（行6）
  setCell(ws, 'E6', '13:30')
  if (record.tempAfternoon != null) setCell(ws, 'H6', record.tempAfternoon)
  if (record.bpSystolicPm != null)  setCell(ws, 'K6', record.bpSystolicPm + '/' + (record.bpDiastolicPm ?? '?'))
  if (record.pulsePm != null)       setCell(ws, 'N6', record.pulsePm)

  // 食事・水分（行7）
  if (record.mealMainFood != null) setCell(ws, 'G7', record.mealMainFood + '割')
  if (record.mealSideFood != null) setCell(ws, 'J7', record.mealSideFood + '割')
  const totalFluid = (record.fluidIntakeAm ?? 0) + (record.fluidIntakePm ?? 0)
  if (totalFluid > 0) setCell(ws, 'N7', totalFluid + 'ml')

  // 入浴・口腔ケア（行8）
  setCell(ws, 'E8', record.bathing === 'DONE' ? '有' : '無')
  setCell(ws, 'M8', record.oralCare ? '有' : '無')

  // 服薬（行9）
  const lunchMed = record.medicationBeforeLunch || record.medicationAfterLunch
  setCell(ws, 'G9', record.medicationMorning ? '有' : '無')
  setCell(ws, 'J9', lunchMed ? '有' : '無')
  setCell(ws, 'M9', record.medicationEvening ? '有' : '無')

  // 機能訓練（行11）
  if (record.trainingDone) {
    if (record.functionalTrainingStart) setCell(ws, 'J11', record.functionalTrainingStart)
    if (record.functionalTrainingEnd)   setCell(ws, 'N11', record.functionalTrainingEnd)
  }

  // AI生成テキスト
  if (aiDaily) setCell(ws, 'A15', aiDaily)
  if (aiRehab) setCell(ws, 'A19', aiRehab)
}

export async function GET(request: Request) {
  await requireSession()

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') ?? ''

  // 複数 or 単一対応
  const residentIdsParam = searchParams.get('residentIds') ?? searchParams.get('residentId') ?? ''
  const residentIds = residentIdsParam.split(',').map(s => s.trim()).filter(Boolean)

  if (!date || residentIds.length === 0) {
    return new Response('Missing date or residentIds', { status: 400 })
  }

  // 利用者・記録を一括取得
  const [{ data: allResidents }, { data: allRecords }] = await Promise.all([
    supabase.from('Resident').select('*').in('id', residentIds),
    supabase.from('DailyRecord').select('*').in('residentId', residentIds).eq('date', date),
  ])

  const residents = (allResidents ?? []) as Resident[]
  const recordMap = new Map<string, DailyRecord>()
  for (const r of (allRecords ?? []) as DailyRecord[]) {
    recordMap.set(r.residentId, r)
  }

  // AI テキスト生成（記録がある利用者のみ・並列）
  const aiTexts = new Map<string, { daily: string; rehab: string }>()
  const apiKey = process.env.GROQ_API_KEY
  if (apiKey) {
    const client = new Groq({ apiKey })
    await Promise.all(
      residents
        .filter(r => recordMap.has(r.id))
        .map(async r => {
          try {
            const texts = await generateAIText(client, r, recordMap.get(r.id)!, date)
            aiTexts.set(r.id, texts)
          } catch (err) {
            console.error('[daily-report] Groq error for', r.name, ':', err)
            aiTexts.set(r.id, { daily: '', rehab: '' })
          }
        })
    )
  }

  // テンプレート読み込み
  const templatePath = path.join(process.cwd(), 'public', 'daily-contact-template.xlsx')
  const templateBuf = fs.readFileSync(templatePath)

  // 出力ワークブック作成
  const outWb = XLSX.utils.book_new()

  // 利用者ごとにシートを作成（元の選択順を維持）
  for (const residentId of residentIds) {
    const resident = residents.find(r => r.id === residentId)
    if (!resident) continue

    const isYoshien = resident.careLevel?.startsWith('要支援') ?? false
    const wb = XLSX.read(templateBuf, { type: 'buffer', cellStyles: true })
    const sheetName = isYoshien ? '要支援' : '要介護'
    const wsName = wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0]

    // ディープクローンでスタイルを保持
    const srcSheet = wb.Sheets[wsName]
    const ws: XLSX.WorkSheet = JSON.parse(JSON.stringify(srcSheet))

    const record = recordMap.get(residentId) ?? null
    const ai = aiTexts.get(residentId) ?? { daily: '', rehab: '' }

    fillSheet(ws, resident, record, date, ai.daily, ai.rehab)

    const tabName = sheetSafeName(resident.name)
    XLSX.utils.book_append_sheet(outWb, ws, tabName)
  }

  if (outWb.SheetNames.length === 0) {
    return new Response('No residents found', { status: 404 })
  }

  const buf = XLSX.write(outWb, { type: 'buffer', bookType: 'xlsx', cellStyles: true })
  const suffix = residentIds.length === 1
    ? (residents[0]?.name ?? '利用者')
    : residentIds.length + '名'
  const filename = '報告書_' + suffix + '_' + date + '.xlsx'

  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(filename),
    },
  })
}
