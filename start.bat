@echo off
chcp 65001 >nul
node main.js --interval 5 --check-kiro-api --separate-files --update-source --verbose