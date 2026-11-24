// Runs before first paint (an external file, because the CSP forbids inline scripts). The theme is always resolved to
// data-theme="light" or "dark" so the stylesheet needs a single dark block and there is no light/dark flash.
try {
  var t = localStorage.getItem("axis-theme");
  if (t !== "light" && t !== "dark") t = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
