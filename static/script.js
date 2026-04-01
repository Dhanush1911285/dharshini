const video = document.getElementById("video");

navigator.mediaDevices.getUserMedia({ video: true })
.then(stream => {
  video.srcObject = stream;
});

function capture() {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  canvas.toBlob(blob => {
    const formData = new FormData();
    formData.append("photo", blob);

    fetch("/upload", {
      method: "POST",
      body: formData
    })
    .then(res => res.text())
    .then(url => alert("Uploaded: " + url));
  });
}