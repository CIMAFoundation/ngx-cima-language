/*
 * syncTranslations.js
 *
 * This script synchronizes translation JSON files with an English reference
 * using AWS Translate to automatically fill in missing translations.
 *
 * Usage:
 *   Create a `.env` in the project root with your AWS credentials and region.
 *   AWS_ACCESS_KEY_ID=YOUR_KEY
 *   AWS_SECRET_ACCESS_KEY=YOUR_SECRET
 *   AWS_REGION=your-region
 *
 *   Install dependencies:
 *     npm install @aws-sdk/client-translate dotenv
 *
 *   Run:
 *     node syncTranslations.js [referenceFile]
 */

// Carica variabili da .env
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');

// Configurazione AWS Translate tramite variabili d'ambiente
const awsConfig = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};
const translateClient = new TranslateClient(awsConfig);

// Configurazione iniziale
const defaultFile = 'en/en.json';
const targetFiles = {
  'it': 'it/it.json',
  'es': 'es/es.json',
  'pt': 'pt/pt.json',
  'fr': 'fr/fr.json',
};

// Ordina ricorsivamente le chiavi di un oggetto
function sortKeysRecursively(obj) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return obj;

  const sorted = {};
  Object.keys(obj).sort().forEach(key => {
    sorted[key] = sortKeysRecursively(obj[key]);
  });
  return sorted;
}

// Carica il file JSON in modo sicuro
function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    const message = `Errore caricando il file ${filePath}: ${error.message}`;
    throw new Error(message);
  }
}

// Salva i dati JSON in modo sicuro e ordinato
function saveJSON(filePath, data) {
  const sortedData = sortKeysRecursively(data);
  fs.writeFileSync(filePath, JSON.stringify(sortedData, null, 2), 'utf8');
  console.log(`Aggiornato ${filePath}`);
}

// Traduci una stringa usando AWS Translate
async function translateText(text, sourceLang, targetLang) {
  try {
    const command = new TranslateTextCommand({
      Text: text,
      SourceLanguageCode: sourceLang,
      TargetLanguageCode: targetLang
    });
    const response = await translateClient.send(command);
    return response.TranslatedText;
  } catch (error) {
    console.error(`Errore durante la traduzione di "${text}" a ${targetLang}:`, error);
    return `[${text}]TO_BE_TRANSLATED`;
  }
}

// Sincronizza le chiavi mancanti usando AWS Translate
async function syncNestedKeys(reference, target, sourceLang, targetLang) {
  let changesMade = false;

  for (const key of Object.keys(reference)) {
    const refValue = reference[key];

    if (!(key in target)) {
      if (typeof refValue === 'object' && refValue !== null && !Array.isArray(refValue)) {
        target[key] = {};
        await syncNestedKeys(refValue, target[key], sourceLang, targetLang);
      } else {
        const translated = await translateText(refValue, sourceLang, targetLang);
        target[key] = translated;
      }
      changesMade = true;
    } else if (typeof refValue === 'object' && refValue !== null && !Array.isArray(refValue)) {
      if (typeof target[key] !== 'object' || target[key] === null || Array.isArray(target[key])) {
        target[key] = {};
        changesMade = true;
      }
      const nestedChange = await syncNestedKeys(refValue, target[key], sourceLang, targetLang);
      if (nestedChange) changesMade = true;
    }
  }

  return changesMade;
}

// Rimuove chiavi non presenti nel riferimento
function removeObsoleteKeys(reference, target) {
  let keysRemoved = false;

  Object.keys(target).forEach((key) => {
    if (!(key in reference)) {
      delete target[key];
      keysRemoved = true;
    } else if (
      typeof target[key] === 'object' &&
      target[key] !== null &&
      typeof reference[key] === 'object' &&
      !Array.isArray(reference[key])
    ) {
      const nestedRemoved = removeObsoleteKeys(reference[key], target[key]);
      if (nestedRemoved) keysRemoved = true;
    }
  });

  return keysRemoved;
}

// Funzione principale di sincronizzazione
async function syncTranslations(referenceFile = defaultFile) {
  const refPath = path.join(__dirname, referenceFile);
  const referenceData = loadJSON(refPath);
  if (!referenceData || typeof referenceData !== 'object' || Array.isArray(referenceData) || Object.keys(referenceData).length === 0) {
    throw new Error(`Il file di riferimento ${referenceFile} è vuoto o non valido.`);
  }
  const sortedReferenceData = sortKeysRecursively(referenceData);
  const sourceLang = referenceFile.split('/')[0];

  for (const [lang, targetFile] of Object.entries(targetFiles)) {
    const targetPath = path.join(__dirname, targetFile);
    const targetData = loadJSON(targetPath);

    const added = await syncNestedKeys(sortedReferenceData, targetData, sourceLang, lang);
    const removed = removeObsoleteKeys(sortedReferenceData, targetData);

    if (added || removed) {
      saveJSON(targetPath, targetData);
      console.log(`Modifiche apportate a ${targetFile} (aggiunte: ${added}, rimosse: ${removed})`);
    } else {
      saveJSON(targetPath, targetData);
      console.log(`Nessuna modifica, ma chiavi riordinate in ${targetFile}`);
    }
  }

  // Riordina anche il file di riferimento
  saveJSON(path.join(__dirname, referenceFile), referenceData);

  console.log('Sincronizzazione completata.');
}

// Avvio dello script
const referenceFile = process.argv[2] || defaultFile;
syncTranslations(referenceFile)
  .then(() => console.log('Done'))
  .catch(err => {
    console.error('Errore nello script:', err);
    process.exitCode = 1;
  });
