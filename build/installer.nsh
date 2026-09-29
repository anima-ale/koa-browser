!include "nsDialogs.nsh"
!include "LogicLib.nsh"

# Scelta micromodelli KOA: pagina dopo la cartella, prima dell'installazione.
# Scrive HKCU\Software\KOA Browser\FetchModels = 1/0 (consumato al primo avvio).
Var KOA_ModelsCheckbox
Var KOA_ModelsDialog

!macro customPageAfterChangeDir
  Page custom koaModelsPageCreate koaModelsPageLeave
!macroend

Function koaModelsPageCreate
  nsDialogs::Create 1018
  Pop $KOA_ModelsDialog
  ${If} $KOA_ModelsDialog == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 22u "Micromodelli locali KOA (pianificatore, italiano, azioni, occhi)"
  Pop $0
  ${NSD_CreateLabel} 0 24u 100% 30u "Servono all'autonomia (circa 4 GB). Se li scarichi ora, KOA li usa subito. Altrimenti te li chiedera al primo comando."
  Pop $0
  ${NSD_CreateCheckbox} 0 58u 100% 12u "Scarica i micromodelli dopo l'installazione"
  Pop $KOA_ModelsCheckbox
  nsDialogs::Show
FunctionEnd

Function koaModelsPageLeave
  ${NSD_GetState} $KOA_ModelsCheckbox $0
  ${If} $0 == 1
    WriteRegStr HKCU "Software\KOA Browser" "FetchModels" "1"
  ${Else}
    WriteRegStr HKCU "Software\KOA Browser" "FetchModels" "0"
  ${EndIf}
FunctionEnd
