// Minimal Firebase API for Jobs page using Firestore
// Exposes window.FirebaseAPI.createJob and window.FirebaseAPI.getJobs
import { getApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

let app;
try {
  app = getApp();
} catch (e) {
  console.error('[FirebaseAPI] Firebase app not initialized before firebase-api.js');
  throw e;
}
const db = getFirestore(app);

const ok = (data) => ({ ok: true, json: async () => data });
const err = (message) => ({ ok: false, json: async () => ({ error: message }) });

async function createJob(job) {
  try {
    const payload = { ...job, posted_at: serverTimestamp() };
    const docRef = await addDoc(collection(db, 'jobs'), payload);
    return ok({ id: docRef.id });
  } catch (e) {
    console.error('[FirebaseAPI] createJob error', e);
    return err(e?.message || 'createJob failed');
  }
}

async function getJobs() {
  try {
    const q = query(collection(db, 'jobs'), orderBy('posted_at', 'desc'));
    const snap = await getDocs(q);
    const list = snap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        ...d,
        posted_at: d.posted_at?.toDate ? d.posted_at.toDate().toISOString() : new Date().toISOString(),
      };
    });
    return ok(list);
  } catch (e) {
    console.error('[FirebaseAPI] getJobs error', e);
    return err(e?.message || 'getJobs failed');
  }
}

window.FirebaseAPI = window.FirebaseAPI || {};
window.FirebaseAPI.createJob = createJob;
window.FirebaseAPI.getJobs = getJobs;
