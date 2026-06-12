(function () {
  const CLINIC_LOCATION = [35.7910, 51.4550]; // موقت: قیطریه تهران
  const MAP_ID = "neshanContactMap";

  function showFallback() {
    const fallback = document.getElementById("neshanMapFallback");
    if (fallback) fallback.hidden = false;
  }

  function initNeshanMap() {
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
        .bindPopup(
          '<div class="clinic-map-popup"><strong>کلینیک چشم‌پزشکی دکتر محمدصادق حق‌پرست</strong><span>محدوده قیطریه تهران</span></div>'
        )
        .openPopup();

      setTimeout(function () {
        map.invalidateSize();
      }, 350);
    } catch (error) {
      console.error("Neshan map initialization failed:", error);
      showFallback();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNeshanMap);
  } else {
    initNeshanMap();
  }
})();
