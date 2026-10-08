'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import './copy.css';
import { shrinkImage, UPLOAD_LIMIT_BYTES } from '@/lib/space/shrinkImage';

type Props =
  | { token: string; mode: 'proof'; claimed: boolean }
  | { token: string; mode: 'cancel'; paid: boolean }
  | { token: string; mode: 'copy' };

/** 报名人状态页上的动作：传付款截图、取消报名、复制自己的报名链接。做完刷新页面，状态说明由服务端重新给 */
export default function RegistrationActions(props: Props) {
  if (props.mode === 'proof') return <ProofUpload token={props.token} claimed={props.claimed} />;
  if (props.mode === 'cancel') return <CancelButton token={props.token} paid={props.paid} />;
  return <CopyLink href={`/space/r/${props.token}`} label="复制我的报名链接" />;
}

/**
 * 复制一个链接。href 可以是站内路径（点的时候补上当前域名）。
 * 微信内置浏览器、非 https 下经常没有剪贴板权限：退回到把链接放进一个选中的输入框，提示长按复制。
 */
export function CopyLink({ href, label, className, textClassName, raw }: {
  href: string; label: string; className?: string; textClassName?: string;
  /** 原样复制（联系方式这类不是链接的文字），不补域名 */
  raw?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'ok' | 'manual'>('idle');
  const [full, setFull] = useState(href);

  useEffect(() => {
    if (state === 'manual') {
      input.current?.focus();
      input.current?.select();
    }
  }, [state]);

  async function copy() {
    const url = raw || /^https?:\/\//.test(href) ? href : `${window.location.origin}${href}`;
    setFull(url);
    try {
      await navigator.clipboard.writeText(url);
      setState('ok');
    } catch {
      setState('manual');
    }
  }

  return (
    <span className={`rc-copy ${className ?? ''}`}>
      <button type="button" className={textClassName ?? 'rc-copy-btn'} onClick={copy}>
        {state === 'ok' ? '复制好了' : label}
      </button>
      {state === 'manual' && (
        <span className="rc-copy-manual">
          <input ref={input} className="rc-copy-input" readOnly value={full} onFocus={e => e.currentTarget.select()} aria-label="链接" />
          <small>没能自动复制。长按上面的链接，选「全选」再「复制」</small>
        </span>
      )}
    </span>
  );
}

function ProofUpload({ token, claimed }: { token: string; claimed: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pick(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      // 截图一般不大；手机相册里的照片可能有好几 MB，先缩一缩（线上接口收不了 4.5MB 以上的请求）
      const small = await shrinkImage(file);
      if (small.size > UPLOAD_LIMIT_BYTES) {
        setMsg({ ok: false, text: '图太大了（超过 4MB），截一张图就够了，换一张试试' });
        return;
      }
      const fd = new FormData();
      fd.append('file', small);
      const res = await fetch(`/api/space/registration/proof?t=${encodeURIComponent(token)}`, { method: 'POST', body: fd });
      if (res.status === 413) {
        setMsg({ ok: false, text: '图太大了（超过 4MB），截一张图就够了，换一张试试' });
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ ok: false, text: data.message || '没有传上，过一会再试一次' });
        return;
      }
      setMsg({ ok: true, text: '传上了，名额给你留着。主人对过收款记录就会确认。' });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: '网络好像断了，检查一下再传一次' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sr-proof">
      <p className="sr-proof-lead">
        {claimed ? '截图已经收到了。传错了的话，可以换一张。' : '付完款，传一张付款成功的截图。'}
      </p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} hidden />
      <button type="button" className="st-btn sr-btn" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? '正在传…' : claimed ? '换一张截图' : '我付好了，传截图'}
      </button>
      {msg && <p className={msg.ok ? 'sr-ok' : 'st-err'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <p className="st-muted">截图只有主人看得到，用来和收款记录对账。</p>
    </div>
  );
}

function CancelButton({ token, paid }: { token: string; paid: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function cancel() {
    const ask = paid
      ? '确定取消报名吗？你已经付过款，取消后退款需要你直接联系主人。'
      : '确定取消报名吗？取消后名额会让给别人。';
    if (!window.confirm(ask)) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`/api/space/registration?t=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.message || '没有取消成功，过一会再试一次');
        return;
      }
      router.refresh();
    } catch {
      setErr('网络好像断了，检查一下再点一次');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sr-cancel">
      <button type="button" className="st-textbtn sr-textbtn" onClick={cancel} disabled={busy}>
        {busy ? '正在取消…' : '取消报名'}
      </button>
      {err && <p className="st-err" role="alert">{err}</p>}
    </div>
  );
}
