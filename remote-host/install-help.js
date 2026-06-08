/** Guida installazione Service Remote su PC (Chrome / Edge). */
(function (global) {
  function isStandalone() {
    try {
      return (
        global.matchMedia("(display-mode: standalone)").matches ||
        global.navigator.standalone === true
      );
    } catch (_) {
      return false;
    }
  }

  function isEdge() {
    return /Edg\//i.test(global.navigator.userAgent || "");
  }

  function manualInstallHtml() {
    if (isEdge()) {
      return (
        "<strong>Installa da Edge:</strong> menu <strong>⋯</strong> (in alto a destra) → " +
        "<strong>App</strong> → <strong>Installa questo sito come app</strong>."
      );
    }
    return (
      "<strong>Installa da Chrome:</strong> menu <strong>⋮</strong> (in alto a destra) → " +
      "<strong>Salva e condividi</strong> → <strong>Installa pagina come app</strong>."
    );
  }

  function alreadyInstalledHtml() {
    return (
      "<strong>App già installata.</strong> Apri l'icona <strong>SvcRemote</strong> dal menu Start. " +
      "Per reinstallare: nella barra indirizzi di Edge scrivi <code>edge://apps</code> → Invio → rimuovi SvcRemote."
    );
  }

  function reinstallHintHtml() {
    return (
      "<br><br><strong>Reinstallazione corretta:</strong> apri solo " +
      "<code>servicehub-18309.web.app/install.html</code> → menu Edge → <strong>Installa questo sito come app</strong>. " +
      "<strong>Non</strong> installare dal link lungo con <code>stabile-2026</code> nell'indirizzo."
    );
  }

  function hasShareLinkInUrl() {
    try {
      var p = String(global.location.pathname || "");
      if (/\/r\/[^/?#]+/i.test(p)) return true;
      var q = new URLSearchParams(global.location.search || "");
      if ((q.get("k") || q.get("K") || "").trim()) return true;
    } catch (_) {}
    return false;
  }

  function reportAlreadyVisible() {
    try {
      var grid = global.document.getElementById("digital-cards-grid");
      if (grid && grid.querySelector(".digital-card")) return true;
    } catch (_) {}
    return false;
  }

  global.__svcRemoteInstallHelp = {
    isStandalone: isStandalone,
    manualInstallHtml: manualInstallHtml,
    alreadyInstalledHtml: alreadyInstalledHtml,
    deferredPrompt: null,
    init: function (opts) {
      opts = opts || {};
      var panel = document.getElementById("svc-remote-install-panel");
      var btn = document.getElementById("svc-remote-install-btn");
      var msg = document.getElementById("svc-remote-install-msg");
      if (!panel || !msg) return;
      if (isStandalone()) {
        panel.style.display = "none";
        return;
      }
      /** Tablet/telefono con LINK REMOTO: solo Digital Report, niente barra installazione. */
      if (hasShareLinkInUrl() || reportAlreadyVisible()) {
        panel.style.display = "none";
        return;
      }
      var onInstallPage = /\/install\.html$/i.test(String(global.location.pathname || ""));
      if (!onInstallPage) {
        panel.style.display = "none";
        return;
      }
      panel.style.display = "flex";

      function setMsg(html) {
        msg.innerHTML = html;
      }

      function tryPrompt() {
        var p = global.__svcRemoteInstallHelp.deferredPrompt;
        if (!p) return false;
        p.prompt();
        p.userChoice
          .then(function () {
            global.__svcRemoteInstallHelp.deferredPrompt = null;
            if (btn) btn.style.display = "none";
            setMsg("<strong>Installazione avviata.</strong> Conferma nel browser.");
          })
          .catch(function () {});
        return true;
      }

      if (btn) {
        btn.onclick = function () {
          if (tryPrompt()) return;
          setMsg(manualInstallHtml());
        };
      }

      global.addEventListener("beforeinstallprompt", function (e) {
        e.preventDefault();
        global.__svcRemoteInstallHelp.deferredPrompt = e;
        setMsg(
          "Seconda app separata da ServiceHub. Clicca <strong>Installa</strong> " +
            "oppure usa il menu del browser."
        );
        if (btn) btn.style.display = "inline-block";
      });

      setTimeout(function () {
        if (global.__svcRemoteInstallHelp.deferredPrompt) return;
        if (btn) btn.style.display = "none";
        setMsg(alreadyInstalledHtml() + reinstallHintHtml() + "<br><br>" + manualInstallHtml());
      }, opts.timeoutMs || 2200);

      if (global.navigator.getInstalledRelatedApps) {
        global.navigator
          .getInstalledRelatedApps()
          .then(function (apps) {
            if (apps && apps.length) {
              if (btn) btn.style.display = "none";
              setMsg(alreadyInstalledHtml());
            }
          })
          .catch(function () {});
      }
    }
  };
})(window);
