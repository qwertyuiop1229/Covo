!define COVO_HOOK_DIRECTORY "${__FILEDIR__}"
!macro NSIS_HOOK_PREINSTALL
  ${If} $UpdateMode = 1
    ClearErrors
    ${GetOptions} $CMDLINE "/COVOSETUP" $0
    ${If} ${Errors}
      InitPluginsDir
      SetOutPath "$PLUGINSDIR"
      File /oname=CovoUpdateProgress.exe "${COVO_HOOK_DIRECTORY}\bin\CovoMaintenance.exe"
      System::Call 'kernel32::GetCurrentProcessId() i.r0'
      Exec '$\"$PLUGINSDIR\CovoUpdateProgress.exe$\" --update-progress $0'
      SetOutPath "$INSTDIR"
    ${EndIf}
  ${EndIf}
!macroend
!macro NSIS_HOOK_POSTINSTALL
  SetOutPath "$INSTDIR"
  File /oname=CovoMaintenance.exe "${COVO_HOOK_DIRECTORY}\bin\CovoMaintenance.exe"
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" '$\"$INSTDIR\CovoMaintenance.exe$\"'
  WriteRegStr SHCTX "${UNINSTKEY}" "QuietUninstallString" '$\"$INSTDIR\uninstall.exe$\" /S'
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$INSTDIR"
  ClearErrors
  ${GetOptions} $CMDLINE "/COVORESETDATA" $0
  ${IfNot} ${Errors}
    ExecWait '$\"$INSTDIR\CovoMaintenance.exe$\" --reset-data' $0
    ${If} $0 != 0
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend
!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\CovoMaintenance.exe"
!macroend
