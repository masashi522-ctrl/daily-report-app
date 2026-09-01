'use client'

import { useEffect } from 'react'

// 両面印刷で「次の方が前の方の裏面に入ってしまう」のを防ぐための部品。
//
// お一人分が奇数ページで終わると、両面印刷ではその用紙の裏側に次の方が刷られてしまう。
// そこで、印刷前にお一人ずつ何ページになるかを測り、奇数で終わる方の後ろに白紙ページを
// 挟むことで、必ず次の方が新しい用紙のおもて面から始まるようにしている。
//
// ページ数は、画面上の各シートを一時的に「1ページ分の大きさの段組み」にして
// 何段になるかを数えることで求めている（段組みと印刷のページ送りは同じ仕組みで折り返すため、
// 実際の印刷ページ数と一致する）。測っている間だけ印刷用の見た目に切り替えるので、
// 画面の表示は変わらない。

// A4縦・余白12mm（@page の指定と合わせること）で、1ページに入る中身の大きさ
const PAGE_WIDTH_MM = 210 - 12 * 2
const PAGE_HEIGHT_MM = 297 - 12 * 2

const mmToPx = (mm: number) => (mm * 96) / 25.4

/** シート1つが何ページになるかを数える */
function countPages(sheet: HTMLElement, pageWidth: number, pageHeight: number) {
  const saved = sheet.getAttribute('style')
  sheet.style.width = `${pageWidth}px`
  sheet.style.height = `${pageHeight}px`
  sheet.style.padding = '0'
  sheet.style.borderWidth = '0'
  sheet.style.columnWidth = `${pageWidth}px`
  sheet.style.columnGap = '0'
  sheet.style.columnFill = 'auto'

  const pages = Math.max(1, Math.round(sheet.scrollWidth / pageWidth))

  if (saved === null) sheet.removeAttribute('style')
  else sheet.setAttribute('style', saved)
  return pages
}

export default function DuplexFillers() {
  useEffect(() => {
    const container = document.getElementById('care-report-sheets')
    if (!container) return

    const layout = () => {
      const sheets = Array.from(container.querySelectorAll<HTMLElement>('.resident-sheet'))
      const fillers = Array.from(container.querySelectorAll<HTMLElement>('.page-filler'))
      if (sheets.length === 0) return

      const pageWidth = mmToPx(PAGE_WIDTH_MM)
      const pageHeight = mmToPx(PAGE_HEIGHT_MM)

      container.classList.add('measuring')
      let pageCounts: number[]
      try {
        pageCounts = sheets.map(sheet => countPages(sheet, pageWidth, pageHeight))
      } finally {
        container.classList.remove('measuring')
      }

      // 前の方までで何ページ刷ったかを数え、奇数で終わっていたら白紙を1枚挟む
      let printed = 0
      sheets.forEach((_, i) => {
        if (i > 0) {
          const needsBlank = printed % 2 === 1
          fillers[i - 1].dataset.on = needsBlank ? '1' : '0'
          if (needsBlank) printed += 1
        }
        printed += pageCounts[i]
      })
    }

    let done = false
    const measureOnce = () => {
      if (!done) layout()
      done = true
    }
    // 文字の読み込みで高さが変わるので、字体が揃ってから測る
    if (document.fonts?.ready) document.fonts.ready.then(measureOnce).catch(measureOnce)
    else measureOnce()

    // 報告書を書き直したあとでも正しい枚数になるよう、印刷の直前にも測り直す
    window.addEventListener('beforeprint', layout)
    return () => window.removeEventListener('beforeprint', layout)
  }, [])

  return null
}
