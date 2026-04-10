document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('upload-form');
  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);

    fetch('/api/upload-transactions', {
      method: 'POST',
      body: formData,
    })
      .then(response => response.json())
      .then(data => {
        console.log('Uploaded transactions:', data.transactions);
        alert('File uploaded successfully!');
      })
      .catch(error => console.error('Error uploading file:', error));
  });
});