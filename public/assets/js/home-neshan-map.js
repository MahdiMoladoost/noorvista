(function () {
  const CLINIC_LOCATION = [35.7910, 51.4550];
  const MAP_ID = "neshanHomeMap";

  function showFallback() {
    const fallback = document.getElementById("homeMapFallback");
    if (fallback) fallback.hidden = false;
  }

  function initHomeNeshanMap() {
    const mapEl = document.getElementById(MAP_ID);
    if (!mapEl) return;

    const keyMeta = document.querySelector('meta[name="neshan-api-key"]');
    const apiKey = keyMeta ? keyMeta.getAttribute("content") : "";

    if (!apiKey || !window.L || typeof window.L.Map !== "function") {
      showFallback();
      return;
    }

    try {
      const map = new window.L.Map(MAP_ID, {
        key: apiKey,
        maptype: "dreamy",
        center: CLINIC_LOCATION,
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false
      });

      window.L.marker(CLINIC_LOCATION)
        .addTo(map)
        .bindPopup('<div class="home-map-popup"><strong>کلینیک چشم‌پزشکی دکتر محمدصادق حق‌پرست</strong><span>محدوده قیطریه تهران</span></div>')
        .openPopup();

      setTimeout(function () {
        map.invalidateSize();
      }, 350);
    } catch (error) {
      console.error("Home Neshan map initialization failed:", error);
      showFallback();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHomeNeshanMap);
  } else {
    initHomeNeshanMap();
  }
})();
