/* ══════════════════════════════════════════════════════════
   PestoRest Pest Control — main.js
   ONE shared script. All pages link here.
   No jQuery. No frameworks. Vanilla JS only.
   ══════════════════════════════════════════════════════════ */

(function () {

  // 1. STICKY HEADER — shrink on scroll
  const header = document.querySelector('header');
  if (header) {
    window.addEventListener('scroll', function () {
      header.classList.toggle('scrolled', window.scrollY > 60);
    }, { passive: true });
  }

  // 2. MOBILE OVERLAY MENU — open/close
  var menuBtn = document.getElementById('menu-open');
  var closeBtn = document.getElementById('menu-close');
  var overlay = document.getElementById('mobile-overlay');
  if (menuBtn && overlay) {
    menuBtn.addEventListener('click', function () {
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      menuBtn.setAttribute('aria-expanded', 'true');
    });
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    }
    // Close overlay when clicking a link
    overlay.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // 3. FAQ ACCORDION
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-item');
      var isOpen = item.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  // 4. SCROLL REVEAL — IntersectionObserver
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal').forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // Fallback: show everything
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('visible');
    });
  }

  // 5. REVIEWS CAROUSEL — auto-advance
  var track = document.querySelector('.carousel-track');
  if (track) {
    var current = 0;
    var slides = track.querySelectorAll('.carousel-slide');
    var dots = document.querySelectorAll('.carousel-dot');
    var total = slides.length;

    function goTo(n) {
      slides[current].classList.remove('active');
      if (dots[current]) dots[current].classList.remove('active');
      current = ((n % total) + total) % total;
      slides[current].classList.add('active');
      if (dots[current]) dots[current].classList.add('active');
    }

    var autoAdvance = setInterval(function () {
      goTo(current + 1);
    }, 5000);

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        clearInterval(autoAdvance);
        goTo(i);
        autoAdvance = setInterval(function () {
          goTo(current + 1);
        }, 5000);
      });
    });
  }

  // 6. FORM PRE-FILL — from data attributes
  var prefillSource = document.querySelector('[data-prefill-pest], [data-prefill-city]');
  if (prefillSource) {
    var pest = prefillSource.dataset.prefillPest;
    var city = prefillSource.dataset.prefillCity;
    var pestSel = document.getElementById('pest');
    var citySel = document.getElementById('city');
    if (pestSel && pest) pestSel.value = pest;
    if (citySel && city) citySel.value = city;
  }

  // 7. HONEYPOT — block bot form submissions
  document.querySelectorAll('.quote-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      var trap = form.querySelector('[name="website"]');
      if (trap && trap.value !== '') {
        e.preventDefault();
      }
    });
  });

  // 8. THEME TOGGLE — dark/light mode
  var themeToggle = document.getElementById('theme-toggle');
  function getPreferredTheme() {
    var stored = localStorage.getItem('theme');
    if (stored) return stored;
    return 'light';
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeToggle) {
      themeToggle.innerHTML = theme === 'dark'
        ? '<i class="fas fa-sun" aria-hidden="true"></i>'
        : '<i class="fas fa-moon" aria-hidden="true"></i>';
      themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }
  applyTheme(getPreferredTheme());
  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      applyTheme(next);
    });
  }

  // 9. MEGA MENU — keyboard accessibility
  var megaTrigger = document.querySelector('.nav-services');
  if (megaTrigger) {
    megaTrigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        megaTrigger.classList.toggle('open');
      }
      if (e.key === 'Escape') {
        megaTrigger.classList.remove('open');
      }
    });
    // Close mega menu on outside click
    document.addEventListener('click', function (e) {
      if (!megaTrigger.contains(e.target)) {
        megaTrigger.classList.remove('open');
      }
    });
  }

})();
