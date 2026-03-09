import type { APIRoute } from 'astro';
import { Resend } from 'resend';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const corsHeaders = {
    'Content-Type': 'application/json',
  };

  try {
    const apiKey = import.meta.env.RESEND_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: 'メール送信が設定されていません' }),
        { status: 500, headers: corsHeaders },
      );
    }

    const body = await request.json();
    const { email, inviteLink, schoolName, expiresAt } = body as {
      email?: string;
      inviteLink?: string;
      schoolName?: string;
      expiresAt?: string;
    };

    if (!email || !inviteLink) {
      return new Response(
        JSON.stringify({ ok: false, error: 'メールアドレスと招待リンクは必須です' }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Basic email validation
    if (!email.includes('@') || email.length > 254) {
      return new Response(
        JSON.stringify({ ok: false, error: 'メールアドレスの形式が正しくありません' }),
        { status: 400, headers: corsHeaders },
      );
    }

    const envFrom = import.meta.env.INVITE_EMAIL_FROM || '';
    const fromAddress = envFrom.includes('@') ? envFrom : 'onboarding@resend.dev';
    const expiresLabel = expiresAt
      ? new Date(expiresAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
      : '7日間';

    const resend = new Resend(apiKey);

    const { error: sendError } = await resend.emails.send({
      from: fromAddress,
      to: email,
      subject: `【ナゾトキ探偵団】${schoolName || '学校'}への教師招待`,
      html: buildInvitationHtml(schoolName || '学校', inviteLink, expiresLabel),
      text: buildInvitationText(schoolName || '学校', inviteLink, expiresLabel),
    });

    if (sendError) {
      console.error('Resend error:', sendError, 'from:', fromAddress);
      const detail = sendError.message || JSON.stringify(sendError);
      return new Response(
        JSON.stringify({ ok: false, error: `メール送信に失敗しました: ${detail}`, debug: { from: fromAddress } }),
        { status: 500, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: corsHeaders },
    );
  } catch (err) {
    console.error('Send invitation email error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: 'メール送信中にエラーが発生しました' }),
      { status: 500, headers: corsHeaders },
    );
  }
};

function buildInvitationHtml(schoolName: string, inviteLink: string, expiresLabel: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"></head>
<body style="font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f0f9ff; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
    <h1 style="font-size: 18px; color: #0369a1; margin: 0 0 8px 0;">教師招待のお知らせ</h1>
    <p style="font-size: 14px; color: #64748b; margin: 0;">ナゾトキ探偵団 学校管理システム</p>
  </div>

  <p style="font-size: 14px; line-height: 1.8;">
    <strong>${schoolName}</strong>の管理者より、教師として招待されました。
  </p>

  <p style="font-size: 14px; line-height: 1.8;">
    以下のリンクをクリックして、学校に参加してください。
  </p>

  <div style="text-align: center; margin: 24px 0;">
    <a href="${inviteLink}"
       style="display: inline-block; background: #0ea5e9; color: #fff; font-weight: bold; font-size: 14px; padding: 12px 32px; border-radius: 8px; text-decoration: none;">
      招待を受け入れる
    </a>
  </div>

  <p style="font-size: 12px; color: #94a3b8; line-height: 1.6;">
    ボタンが使えない場合は、以下のURLをブラウザに貼り付けてください：<br>
    <a href="${inviteLink}" style="color: #0ea5e9; word-break: break-all;">${inviteLink}</a>
  </p>

  <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px;">
    <p style="font-size: 12px; color: #94a3b8; margin: 0;">
      有効期限: ${expiresLabel}<br>
      このメールに心当たりがない場合は、無視してください。<br>
      ご不明点は学校の管理者へお問い合わせください。
    </p>
  </div>
</body>
</html>`;
}

function buildInvitationText(schoolName: string, inviteLink: string, expiresLabel: string): string {
  return `【ナゾトキ探偵団】教師招待のお知らせ

${schoolName}の管理者より、教師として招待されました。

以下のリンクから学校に参加してください：
${inviteLink}

有効期限: ${expiresLabel}

このメールに心当たりがない場合は、無視してください。
ご不明点は学校の管理者へお問い合わせください。`;
}
