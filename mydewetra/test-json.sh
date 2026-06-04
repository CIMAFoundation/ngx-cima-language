#!/bin/bash

echo "🔍 Controllo dei file JSON modificati in corso..."

# Trova i file JSON modificati rispetto all'ultimo commit
json_files=$(git diff --name-only --diff-filter=ACM | grep '\.json$')

if [ -z "$json_files" ]; then
  echo "ℹ️  Nessun file JSON modificato trovato."
  exit 0
fi

errore=0

for file in $json_files; do
    if ! jq empty "$file" > /dev/null 2>&1; then
        echo "❌ Errore: $file non è un JSON valido."
        errore=1
    else
        echo "✅ $file è valido."
    fi
done

if [ $errore -eq 1 ]; then
    echo "🚫 Sono stati trovati errori nei file JSON."
    exit 1
else
    echo "🎉 Tutti i file JSON modificati sono validi."
    exit 0
fi
