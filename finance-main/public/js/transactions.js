document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/analyze-transactions')
    .then(response => response.json())
    .then(data => {
      console.log('All transactions:', data.categorizedTransactions);
      const table = document.getElementById('transactions-table');
      data.categorizedTransactions.others.forEach(transaction => {
        const row = table.insertRow();
        row.insertCell(0).textContent = transaction.description;
        row.insertCell(1).textContent = `₹${transaction.amount}`;
      });
    })
    .catch(error => console.error('Error fetching data:', error));
});