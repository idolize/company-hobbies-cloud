import * as functions from 'firebase-functions';
import admin from 'firebase-admin';
import firebase from 'firebase';

// https://firebase.google.com/docs/functions/typescript
admin.initializeApp();

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
