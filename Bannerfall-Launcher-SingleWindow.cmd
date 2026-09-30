@echo off
chcp 65001 >nul
title Bannerfall Launcher - Single Window v2
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Bannerfall-Launcher-SingleWindow.ps1"
