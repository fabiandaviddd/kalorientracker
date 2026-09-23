// Kalorientracker – Verhalten der App

const $ = (id) => document.getElementById(id);

// ---------- Anzeige ----------

function formatNumber(n) {
  return Math.round(n).toLocaleString('de-DE');
}

function renderToday() {
  $('today-date').textContent = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // Noch keine gespeicherten Mahlzeiten – kommt in Schritt 8
  const meals = [];
  const totals = meals.reduce(
    (sum, m) => ({
      kcal: sum.kcal + m.kcal,
      protein: sum.protein + m.protein,
      carbs: sum.carbs + m.carbs,
      fat: sum.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  $('total-kcal').textContent = formatNumber(totals.kcal);
  $('total-protein').textContent = formatNumber(totals.protein) + ' g';
  $('total-carbs').textContent = formatNumber(totals.carbs) + ' g';
  $('total-fat').textContent = formatNumber(totals.fat) + ' g';
}

// ---------- Navigation zwischen Ansichten ----------

function showView(name) {
  $('view-today').hidden = name !== 'today';
  $('view-settings').hidden = name !== 'settings';
  window.scrollTo(0, 0);
}

let toastTimer;
function showToast(text) {
  const toast = $('toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 2000);
}

// ---------- Start ----------

$('open-settings').addEventListener('click', () => showView('settings'));
$('close-settings').addEventListener('click', () => showView('today'));
$('add-meal').addEventListener('click', () => showToast('Foto aufnehmen kommt in Schritt 5'));

// Datum aktualisieren, wenn die App nach Mitternacht wieder geöffnet wird
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderToday();
});

renderToday();
