#!/bin/bash
cd "`dirname \"$0\"`"
script_path="`pwd`"

cd ..
embed-markdown # Update .md files before embedding the .md files into docs

cd "$script_path"
rm -rf generated

npx jsdoc --configure jsdoc.config.json --destination generated/libs/api --readme api.md ../src/api.js
npx jsdoc --configure jsdoc.config.json `find ../src -name '*.js' -type f`

sed -e "s/docs\\/api[.]md/libs\\/api\\/index.html/g" generated/index.html > generated/tmp
mv generated/tmp generated/index.html
