// Runs before first paint (external file: the CSP forbids inline scripts). Prevents a light/dark flash.
try {
  var t = localStorage.getItem("axis-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
