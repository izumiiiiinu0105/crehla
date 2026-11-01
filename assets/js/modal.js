/* フッターのリンクを押すと、内容をポップアップ（dialog）で見せる。
   閉じるのは ×・Esc・外側のクリック。開いている間はページをスクロールさせない。 */
const links = document.querySelectorAll('[data-modal]');

for (const a of links) {
  const dlg = document.getElementById(a.dataset.modal);
  if (!dlg || typeof dlg.showModal !== 'function') continue;   // 非対応のブラウザでは、ただのリンクのまま
  a.addEventListener('click', e => {
    e.preventDefault();
    /* 背景が白なら日本語の見出しを、黒なら英語の見出しを、ポップアップの名前にする */
    const ja = document.documentElement.dataset.theme === 'light';
    dlg.setAttribute('aria-labelledby', ja ? `${dlg.id}-title-ja` : `${dlg.id}-title`);
    /* 言語ごとの本文は、CSS だけでなく hidden でも切り替える（古い CSS が残っていても混ざらない） */
    dlg.querySelectorAll('.t-en').forEach(el => { el.hidden = ja; });
    dlg.querySelectorAll('.t-ja').forEach(el => { el.hidden = !ja; });
    dlg.showModal();
    dlg.scrollTop = 0;
    document.documentElement.classList.add('is-modal');
  });
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();   // 外側（背景）か × を押した
  });
  dlg.addEventListener('close', () => document.documentElement.classList.remove('is-modal'));
}
