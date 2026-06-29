# 📋 Movora Setup & Publishing Checklist

This checklist outlines all the steps, assets, and requirements needed to transition **Movora** from development to production. It covers **Twilio/MSG91 configurations**, **Meta Business Account verification**, and the step-by-step path to package and publish your React/Vite web application on the **Google Play Store**.


## 📱 Part 3: Google Play Store Publishing Checklist

Since **Movora** is a web app built on React and Vite, you must package it into a native Android container before publishing it. 

### 3.1 Wrap Your Web App with Capacitor (Highly Recommended)
Capacitor is the modern, standard way to build Android applications from Vite React projects without maintaining a separate Flutter or React Native codebase.

- [ ] **Install Capacitor in `frontend`**:
  ```bash
  cd frontend
  npm install @capacitor/core @capacitor/cli
  ```
- [ ] **Initialize Capacitor Config**:
  ```bash
  npx cap init "Movora" "com.movora.gym" --web-dir=dist
  ```
- [ ] **Add Android Platform**:
  ```bash
  npm install @capacitor/android
  npx cap add android
  ```
- [ ] **Build and Sync**:
  Compile your React app and transfer the static files to the Android project folder:
  ```bash
  npm run build
  npx cap sync
  ```
- [ ] **Install Android Studio**:
  Download and install [Android Studio](https://developer.android.com/studio).
- [ ] **Open the Android project**:
  ```bash
  npx cap open android
  ```
  This opens the project inside Android Studio.

### 3.2 Prepare Google Play Developer Account
- [ ] **Sign Up**: Go to the [Google Play Console](https://play.google.com/console/signup).
- [ ] **Developer Registration Fee**: Pay a **$25 USD one-time registration fee**.
- [ ] **Identity Verification**: Submit a government-issued ID (Passport, National ID, or Driver's License) to complete verification.
- [ ] **Business Verification**: If registering as an organization, submit your legal business documents.

### 3.3 Configure & Build Your App inside Android Studio
- [ ] **Set Up Launcher Icons**:
  * In Android Studio, right-click `app > res`, go to `New > Image Asset`.
  * Import your logo and create adaptive launcher icons (foreground + background).
- [ ] **Configure Build Settings** (`app/build.gradle`):
  * Verify `applicationId` matches your package name (e.g. `com.movora.gym`).
  * Set `versionCode` (increments by 1 each time you publish, e.g., `1`, `2`, `3`).
  * Set `versionName` (user-facing, e.g., `"1.0.0"`).
- [ ] **Generate Upload Keystore**:
  * In Android Studio, go to `Build > Generate Signed Bundle / APK...`
  * Select **Android App Bundle (AAB)** (required for Play Store uploads).
  * Create a new Keystore file (`.jks`). Store it in a secure location and **make a backup**.
  > [!CAUTION]
  > If you lose your Keystore or forget the password, you will not be able to push updates to the app store.
- [ ] **Build Signed AAB File**:
  * Compile the release bundle using the keystore. The resulting `.aab` file will be generated under `android/app/release/app-release.aab`.

### 3.4 Establish Store Metadata & Assets
- [ ] **Write Descriptions**:
  * **Short Description**: Max 80 characters.
  * **Full Description**: Max 4,000 characters.
- [ ] **Design Graphic Assets**:
  * **App Icon**: 512x512 pixels, 32-bit PNG, transparent or solid background, max 1MB.
  * **Feature Graphic**: 1024x500 pixels, JPG or 24-bit PNG (no transparency), max 1MB.
- [ ] **Take Screenshots (GPS Screenshots)**:
  * At least 2–4 phone screenshots (minimum 320px width, aspect ratio 16:9 or 9:16).
  * At least 2–4 tablet screenshots (7-inch and 10-inch) if you want tablet compatibility.
- [ ] **Host a Privacy Policy**:
  * Create a public webpage (e.g. `https://movora.com/privacy`) detailing what user data you collect (phone numbers, emails, gym records) and how it is processed.

### 3.5 Setup Play Console and Pass the Closed Testing Track
> [!WARNING]
> **Google's 20-Tester Policy (Mandatory)**: 
> For all personal developer accounts created after November 2023, Google requires a **Closed Testing Track** with **at least 20 testers** who must remain active in the app for **14 consecutive days** before Google allows you to apply for production release.

- [ ] **Gather Testers**: List at least 20 Gmail addresses of friends, family, or colleagues.
- [ ] **Release to Closed Testing**:
  * Go to Play Console > Testing > Closed testing.
  * Create a release, upload your `.aab` bundle, and target your email list.
- [ ] **Engage Testers**: 
  * Instruct all 20 testers to download the app (via the private opt-in link provided by Play Console) and keep the app installed on their devices for 14 continuous days.
- [ ] **Answer Data Safety Questionnaire**:
  * Declare that the app collects personal info (Name, Email, Phone Number), that the data is encrypted in transit, and that users can request account deletion.
- [ ] **Answer Content Rating Questionnaire**:
  * Complete the IARC survey to receive the appropriate age rating.
- [ ] **Complete Dashboard Questionnaires**:
  * Declare target audience (e.g. Ages 18+).
  * Declare if the app has ads (No).
  * Declare if the app is a news app (No).
- [ ] **Apply for Production Publishing**:
  * After 14 consecutive days of closed testing, click the button on the dashboard to request access to Production.
  * Upload your release bundle to the **Production track** and submit.
  * *Google's review team will review your app (first-time apps take 3–7 business days).*