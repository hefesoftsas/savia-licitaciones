export function bindWebTheme(theme, root, media) {
  const apply = () => {
    const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    root.classList.toggle('dark', resolved === 'dark');
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
  };
  apply();
  media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}
