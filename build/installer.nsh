!macro customUnInstall
${GetOptions} $R0 "--updated" $R1
  ${If} ${Errors}
    RMDir /r "$APPDATA\${APP_FILENAME}"
  ${endif}
!macroend