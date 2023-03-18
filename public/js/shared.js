window.download_text = function(url) {
  return new Promise((resolve, reject) => {
    fetch(url)
      .then(res => {
        URL.revokeObjectURL(url);
        return res.text();
      })
      .then(data => {
        resolve(data);
      });
  });
}

window.text_to_file = function(name, data, type) {
  const download = data => {
    const blob = new Blob([data], { type: (type || 'text/plain') }),
      link = document.createElement('a'),
      blob_url = URL.createObjectURL(blob);

    link.download = name;
    link.href = blob_url;
    link.click();

    URL.revokeObjectURL(blob_url);
  };

  if (!data.indexOf('blob:')) {
    window.download_text()
      .then(data => {
        download(data);
      });
  } else {
    download(data);
  }
}