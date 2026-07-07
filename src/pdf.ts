import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

// Upload a property's PM-requirements PDF to Firebase Storage. If Storage is
// unavailable (bucket not enabled / rules deny), fall back to an inline data
// URL — but only when the file fits inside a Firestore document.
export async function uploadPropertyPdf(propertyId: string, file: File): Promise<{ url: string; name: string }> {
  try {
    const r = storageRef(storage, `pm-requirements/${propertyId}/${Date.now()}-${file.name}`);
    await uploadBytes(r, file, { contentType: 'application/pdf' });
    const url = await getDownloadURL(r);
    return { url, name: file.name };
  } catch {
    if (file.size > 700_000) {
      throw new Error('Upload to Firebase Storage failed, and this PDF is too large (over 700 KB) to store inline. Enable Firebase Storage for the project or use a smaller PDF.');
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
    return { url: dataUrl, name: file.name };
  }
}

// Open a stored PDF whether it's a hosted URL or an inline data URL
// (data URLs can't be opened directly in a new tab in most browsers).
export function openPdf(url: string) {
  if (url.startsWith('data:')) {
    fetch(url)
      .then(r => r.blob())
      .then(blob => window.open(URL.createObjectURL(blob), '_blank'));
  } else {
    window.open(url, '_blank');
  }
}
