(function () {
  const routes = {
    home: "/index.html",
    eco: "/eco-select.html",
    scan: "/scan-impact.html",
    suivi: "/suivi-co2.html",
  };

  function setActiveByUrl() {
    const path = window.location.pathname || "";
    const items = document.querySelectorAll(".honoua-footer-nav__item");

    items.forEach((btn) => {
      const key = btn.getAttribute("data-page");
      const url = routes[key] || "";
      const isActive = url && path === url;
      btn.classList.toggle("is-active", isActive);
    });
  }

  function initFooterNav() {
    const nav = document.querySelector(".honoua-footer-nav");
    if (!nav) return;

    nav.addEventListener("click", (e) => {
      const btn = e.target.closest(".honoua-footer-nav__item");
      if (!btn) return;

      const page = btn.getAttribute("data-page");
      const targetUrl = routes[page];
      if (!targetUrl) return;

      if (window.location.pathname === targetUrl) return;
      window.location.href = targetUrl;
    });

    setActiveByUrl();
  }

  document.addEventListener("DOMContentLoaded", initFooterNav);
})();
