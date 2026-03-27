import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendReportEmail(
  to: string,
  leaderName: string,
  reportDate: string,
  summary: string,
  reportId: string
) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: `【日報】${leaderName}さんの日報 - ${reportDate}`,
    html: `
      <h2>日報が届きました</h2>
      <p><strong>${leaderName}</strong>さんから日報が届きました。</p>
      <p><strong>日付：</strong>${reportDate}</p>
      <hr>
      <h3>まとめ</h3>
      <p>${summary.replace(/\n/g, '<br>')}</p>
      <hr>
      <p><a href="${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/admin/reports/${reportId}">詳細を確認する</a></p>
    `,
  })
}

export async function sendCommentEmail(
  to: string,
  adminName: string,
  reportDate: string,
  comment: string
) {
  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: `【コメント】管理者からコメントが届きました - ${reportDate}`,
    html: `
      <h2>管理者からコメントが届きました</h2>
      <p><strong>${adminName}</strong>さんからコメントが届きました。</p>
      <p><strong>日付：</strong>${reportDate}</p>
      <hr>
      <h3>コメント内容</h3>
      <p>${comment.replace(/\n/g, '<br>')}</p>
    `,
  })
}
