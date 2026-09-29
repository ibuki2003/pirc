export function watchVisibility(onHide: () => void, onShow: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(timer);
    if (document.hidden) timer = setTimeout(onHide, 30000);
    else onShow();
  };
  document.addEventListener("visibilitychange", changed);
  changed();
  return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", changed); };
}
