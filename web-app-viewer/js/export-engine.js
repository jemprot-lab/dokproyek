/**
 * export-engine.js
 * Integrasi JSZip (Batch ZIP via GET_PHOTO_BLOB proxy), jsPDF (Laporan PDF 1-Klik), & WhatsApp Share.
 */

const ExportEngine = {
  async downloadBatchJpg(selectedPhotos, onProgress) {
    if (!selectedPhotos.length) return;
    for (let i = 0; i < selectedPhotos.length; i++) {
      const p = selectedPhotos[i];
      if (onProgress) onProgress(`Mengunduh JPG ${i + 1}/${selectedPhotos.length}: ${p.name}...`);
      const res = await callGasApi('GET_PHOTO_BLOB', { fileId: p.id });
      if (res.status === 'success' && res.base64Data) {
        const byteChars = atob(res.base64Data);
        const byteNumbers = new Array(byteChars.length);
        for (let j = 0; j < byteChars.length; j++) {
          byteNumbers[j] = byteChars.charCodeAt(j);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: res.mimeType || 'image/jpeg' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = res.fileName || p.name;
        a.click();
        URL.revokeObjectURL(a.href);
        await new Promise((r) => setTimeout(r, 300));
      }
    }
    if (onProgress) onProgress('');
  },

  async downloadBatchZip(selectedPhotos, projectName, subFolderName, onProgress) {
    if (!selectedPhotos.length) return;
    if (typeof JSZip === 'undefined') {
      alert('Library JSZip belum termuat.');
      return;
    }

    const zip = new JSZip();
    for (let i = 0; i < selectedPhotos.length; i++) {
      const p = selectedPhotos[i];
      if (onProgress) onProgress(`Mengunduh ${i + 1}/${selectedPhotos.length}: ${p.name}...`);
      const res = await callGasApi('GET_PHOTO_BLOB', { fileId: p.id });
      if (res.status === 'success' && res.base64Data) {
        zip.file(res.fileName || p.name, res.base64Data, { base64: true });
      }
    }

    if (onProgress) onProgress('Membungkus file .ZIP...');
    const blob = await zip.generateAsync({ type: 'blob' });
    const safeName = `${projectName || 'Proyek'}_${subFolderName || 'Foto'}.zip`.replace(/[^\w.-]+/g, '_');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeName;
    a.click();
    URL.revokeObjectURL(a.href);
    if (onProgress) onProgress('');
  },

  async generatePdfReport(selectedPhotos, projectName, subFolderName, onProgress) {
    if (!selectedPhotos.length) return;
    if (typeof window.jspdf === 'undefined') {
      alert('Library jsPDF belum termuat.');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // Kop Laporan
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(245, 158, 11);
    doc.setFontSize(14);
    doc.text('LAPORAN DOKUMENTASI PROYEK KONSTRUKSI', 14, 11);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(`Proyek: ${projectName || '-'}  |  Progres: ${subFolderName || '-'}`, 14, 19);

    let y = 34;
    let col = 0;

    for (let i = 0; i < selectedPhotos.length; i++) {
      const p = selectedPhotos[i];
      if (onProgress) onProgress(`Menyusun PDF ${i + 1}/${selectedPhotos.length}...`);

      const res = await callGasApi('GET_PHOTO_BLOB', { fileId: p.id });
      if (res.status !== 'success') continue;

      const x = col === 0 ? 14 : 110;
      const imgData = `data:${res.mimeType || 'image/jpeg'};base64,${res.base64Data}`;

      try {
        doc.addImage(imgData, 'JPEG', x, y, 86, 62);
      } catch {
        doc.rect(x, y, 86, 62);
      }

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(8.5);
      doc.text(`${p.name}`, x, y + 67, { maxWidth: 86 });
      doc.setTextColor(100, 116, 139);
      doc.text(`Waktu: ${p.takenTime || '-'}`, x, y + 72);

      if (p.gps) {
        const mapsUrl = `https://maps.google.com/?q=${p.gps.lat},${p.gps.lng}`;
        doc.setTextColor(16, 185, 129);
        doc.textWithLink(`GPS: ${p.gps.lat.toFixed(5)}, ${p.gps.lng.toFixed(5)}`, x, y + 77, { url: mapsUrl });
      } else {
        doc.setTextColor(249, 115, 22);
        doc.text('GPS: Tidak tersedia', x, y + 77);
      }

      if (p.caption) {
        doc.setTextColor(51, 65, 85);
        doc.text(`Catatan: ${p.caption}`, x, y + 82, { maxWidth: 86 });
      }

      col++;
      if (col === 2) {
        col = 0;
        y += 96;
        if (y > 250 && i < selectedPhotos.length - 1) {
          doc.addPage();
          y = 18;
        }
      }
    }

    const pdfName = `Laporan_${projectName || 'Proyek'}_${subFolderName || 'Foto'}.pdf`.replace(/[^\w.-]+/g, '_');
    doc.save(pdfName);
    if (onProgress) onProgress('');
  },

  shareToWhatsApp(messageText) {
    if (typeof UiFeedback !== 'undefined') {
      UiFeedback.showWaShareModal(messageText);
    } else {
      const url = `https://web.whatsapp.com/send?text=${encodeURIComponent(messageText)}`;
      window.open(url, '_blank');
    }
  }
};
