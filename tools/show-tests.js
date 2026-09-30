// Zeigt das Ergebnis von tests.js in tests.html an
const results = runTests();
const failed = results.filter((r) => !r.ok);
document.getElementById('summary').textContent = failed.length ? `${failed.length} von ${results.length} Tests fehlgeschlagen` : `Alle ${results.length} Tests bestanden`;
document.getElementById('results').replaceChildren(
  ...results.map((r) => {
    const li = document.createElement('li');
    li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}`;
    if (!r.ok) {
      li.className = 'fail';
      const error = document.createElement('span');
      error.className = 'error';
      error.textContent = r.error;
      li.append(error);
    }
    return li;
  })
);
