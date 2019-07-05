import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import * as firebase from 'firebase/app';
// tslint:disable-next-line: no-import-side-effect
import 'firebase/auth';

// Setup both the admin and client JS SDKs for firebase
const app = admin.initializeApp();
firebase.initializeApp({
  apiKey: 'AIzaSyBOjY4FRLh8EtTrHXtMoPo7C8GtStVLu7Y',
  authDomain: 'company-hobbies.firebaseapp.com',
  databaseURL: app.options.databaseURL,
  projectId: app.options.projectId,
  storageBucket: app.options.storageBucket,
  messagingSenderId: '991996389799',
  appID: '1:991996389799:web:555d99a85b790f4e',
});

const findCompanyForDomain = async (domain: string): Promise<FirebaseFirestore.QueryDocumentSnapshot | undefined> => {
  const companies = await admin.firestore().collection('companies').get();
  // This is O(N * M), but we expect small values for N and M
  // (since we won't have too many companies whitelisted, and each company should only have 1 or 2 domains)
  return companies.docs.find(doc => (doc.get('domains') || []).indexOf(domain) !== -1);
}

const sendEmailVerificationIfNeeded = async (user: admin.auth.UserRecord): Promise<void> => {
  const { uid, emailVerified } = user;
  if (!emailVerified) {
    const customToken = await admin.auth().createCustomToken(uid);
    await firebase.auth().signInWithCustomToken(customToken);
    const currentUser = firebase.auth().currentUser;
    if (currentUser) {
      await currentUser.sendEmailVerification();
    }
  }
}

// All exported functions are considered "cloud functions"
// https://firebase.google.com/docs/functions/typescript

export const newUserOnboarding = functions.auth.user().onCreate(async (user) => {
  const { uid, email } = user;
  const emailDomain = email ? email.substring(email.lastIndexOf('@') + 1) : '';
  // Verify this email domain comes from a whitelisted company
  const company = await findCompanyForDomain(emailDomain);
  if (company) {
    await Promise.all([
      // Set a custom auth claim for this user so we can quickly verify their company
      admin.auth().setCustomUserClaims(uid, { company_id: company.id }),
      // Associate a companyUser document to help us find all users for a hobby & all of a user's hobbies
      admin.firestore().collection('companyUsers').doc(uid).set({
        company: company.ref.path,
      }),
      // Send an initial verification email to the user
      sendEmailVerificationIfNeeded(user),
    ]);
  }
});

export const userOffboarding = functions.auth.user().onDelete(async (user) => {
  const { uid } = user;
  // Delete associated companyUser document
  await admin.firestore().collection('companyUsers').doc(uid).delete();
});

export const hobbyDeleted = functions.firestore
  .document('companies/{companyId}/hobbies/{hobbyId}')
  .onDelete(async (snapshot, context) => {
    const hobbyId: string = context.params.hobbyId;
    if (hobbyId) {
      // Delete corresponding hobby image if it exists
      const bucket = admin.storage().bucket();
      const file = bucket.file(hobbyId);
      if (await file.exists()) {
        await file.delete();
      }
    }
  });

