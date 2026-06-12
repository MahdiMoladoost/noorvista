(function () {
  // Safe compatibility file: no layout manipulation.
  function currentFile() {
    const last = (location.pathname.split('/').pop() || 'index.html').split('?')[0];
    return last || 'index.html';
  }
  function run() {
    document.querySelectorAll('.nv-sidebar-profile, .noorvista-sidebar-user, .noorvista-sidebar-tools').forEach(el => el.remove());
    const cur = currentFile();
    document.querySelectorAll('.sidebar .nav-link').forEach(link => {
      const matches = (link.getAttribute('data-sidebar-match') || '').split(',').filter(Boolean);
      const href = (link.getAttribute('href') || '').split('/').pop() || 'index.html';
      link.classList.toggle('active', matches.includes(cur) || href === cur || (cur === 'index.html' && matches.includes('')));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
