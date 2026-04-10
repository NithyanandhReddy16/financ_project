document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/analyze-transactions')
    .then(response => response.json())
    .then(data => {
      console.log('Spending distribution data:', data.categorizedTransactions);
      const ctx = document.getElementById('spending-chart').getContext('2d');
      const categories = Object.keys(data.categorizedTransactions);
      const amounts = categories.map(category =>
        data.categorizedTransactions[category].reduce((sum, transaction) => sum + transaction.amount, 0)
      );

      new Chart(ctx, {
        type: 'pie',
        data: {
          labels: categories,
          datasets: [{
            data: amounts,
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4CAF50'],
          }],
        },
      });
    })
    .catch(error => console.error('Error fetching data:', error));
});