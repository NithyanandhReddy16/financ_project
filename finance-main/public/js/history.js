document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/analyze-transactions')
    .then(response => response.json())
    .then(data => {
      console.log('Transaction history:', data.categorizedTransactions);
      // Add logic to render transaction history here
    })
    .catch(error => console.error('Error fetching data:', error));
});