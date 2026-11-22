/**
 * POST /api/bp/verify
 *
 * 只有 bp/config.json 的 enable_verify=true 时 connector 才会调这个接口。
 * 本项目 enable_verify=false（纯静态），此文件仅作留档：接真面板时把
 * config.json 的 enable_verify 改成 true，并在 Pages 里配 PANEL_ORIGIN 环境变量。
 */
export async function onRequestPost({ request, env }) {
  const origin = (env && env.PANEL_ORIGIN) || 'https://annangourmet.makeup';
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';

  try {
    const res = await fetch(`${origin}/api/UserEnvironmentDetection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': ua },
      body: JSON.stringify({ user_ip: ip, user_agent: ua, referer: body.referer || '' }),
    });
    const j = await res.json().catch(() => null);
    if (j && j.status === 'success') {
      return Response.json({ ok: true, data: j.data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json(
      { ok: false, reason: (j && j.data && j.data.reason) || 'denied' },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    return Response.json({ ok: false, reason: 'panel_unreachable' }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
