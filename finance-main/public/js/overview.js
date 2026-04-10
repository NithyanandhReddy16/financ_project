document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/analyze-transactions')
    .then(response => response.json())
    .then(data => {
      document.getElementById('total-income').textContent = `₹${data.totalIncome}`;
    })
    .catch(error => console.error('Error fetching data:', error));
});