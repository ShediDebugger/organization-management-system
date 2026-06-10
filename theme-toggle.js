const themeKey = 'orgmemberTheme';

function setSystemTheme(theme) {
  const body = document.body;
  const isFeature = theme === 'feature';
  if (isFeature) {
    body.classList.add('theme-feature');
  } else {
    body.classList.remove('theme-feature');
  }

  const buttons = document.querySelectorAll('.theme-toggle-btn');
  buttons.forEach(button => {
    if (isFeature) {
      button.innerHTML = '<i class="bi bi-sun-fill"></i>';
      button.title = 'Switch to default light theme';
    } else {
      button.innerHTML = '<i class="bi bi-moon-stars-fill"></i>';
      button.title = 'Switch to dark feature theme';
    }
  });
}

function initThemeToggle() {
  const savedTheme = localStorage.getItem(themeKey) || 'default';
  setSystemTheme(savedTheme);

  document.querySelectorAll('.theme-toggle-btn').forEach(button => {
    button.addEventListener('click', () => {
      const nextTheme = document.body.classList.contains('theme-feature') ? 'default' : 'feature';
      localStorage.setItem(themeKey, nextTheme);
      setSystemTheme(nextTheme);
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeToggle);
} else {
  initThemeToggle();
}
