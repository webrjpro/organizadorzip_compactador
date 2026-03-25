; ============================================================
; Zipador de Alta Performance - Instalador Profissional
; Inno Setup Script (v6.6.1+)
; ============================================================
;
; SOBRE:
;   Script de instalação para o Zipador de Alta Performance.
;   Gera um instalador nativo Windows (.exe) com:
;   - EULA (Contrato de Licença) obrigatório antes da instalação
;   - Suporte a 3 idiomas (PT-BR, EN, ES) no wizard
;   - Atalhos no Menu Iniciar, Área de Trabalho e Barra de Tarefas
;   - Menu de contexto do Windows (botão direito em pastas e .zip)
;   - Registro do Windows com info do app e desenvolvedor
;   - Detecção de instalação anterior + desinstalação automática
;   - Compressão LZMA2/ultra64 para setup compacto
;
; COMO COMPILAR:
;   1. Instalar Inno Setup 6.6.1+ (https://jrsoftware.org/isinfo.php)
;   2. Colocar este arquivo na mesma pasta que Zipador.exe, zipador.ico,
;      LICENCA.txt, wizard_large.bmp e wizard_small.bmp
;   3. Compilar via linha de comando:
;      & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "instalador.iss"
;   4. O instalador será gerado em: instalador\Zipador_Setup_1.0.0.exe
;
; PRÉ-REQUISITOS DO BUILD:
;   - Zipador.exe (compilado via PyInstaller)
;   - zipador.ico (ícone multi-resolução)
;   - LICENCA.txt (EULA em português)
;   - wizard_large.bmp (164x314 px, imagem lateral do wizard)
;   - wizard_small.bmp (55x55 px, ícone no canto do wizard)
;
; AUTOR: Carlos Antonio de Oliveira Piquet
; COPYRIGHT: (C) 2026 Piquet Software
; ============================================================

; ----------------------------------------------------------
; Constantes do aplicativo (usadas em todas as seções)
; ----------------------------------------------------------
#define MyAppName "Zipador"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Piquet Software - Carlos Antonio de Oliveira Piquet"
#define MyAppURL "mailto:carlospiquet.projetos@gmail.com"
#define MyAppExeName "Zipador.exe"
#define MyAppDescription "Compactador e Descompactador ZIP de Alta Performance"
#define MyAppCopyright "Copyright \u00a9 2026 Carlos Antonio de Oliveira Piquet - Piquet Software"
#define MyAppContact "carlospiquet.projetos@gmail.com"
#define MyAppDeveloper "Carlos Antonio de Oliveira Piquet"

[Setup]
; --- Identificação única do aplicativo ---
; O AppId é um GUID fixo que identifica o app entre instalações/atualizações.
; NÃO alterar este GUID após a primeira distribuição.
AppId={{A7F3B2C1-4D5E-6F78-9A0B-C1D2E3F4A5B6}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
AppCopyright={#MyAppCopyright}
VersionInfoVersion={#MyAppVersion}
VersionInfoDescription={#MyAppDescription}
VersionInfoCompany={#MyAppPublisher}
VersionInfoCopyright={#MyAppCopyright}
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

; --- Licença (EULA) ---
; Exibida como tela obrigatória antes da instalação.
; O usuário deve aceitar os termos para prosseguir.
LicenseFile=LICENCA.txt

; --- Diretórios de instalação e saída ---
; {autopf} = Program Files do usuário (não requer admin)
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=instalador
OutputBaseFilename=Zipador_Setup_{#MyAppVersion}

; --- Aparência visual do wizard ---
SetupIconFile=zipador.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
WizardStyle=modern
WizardImageFile=wizard_large.bmp
WizardSmallImageFile=wizard_small.bmp

; --- Compressão do instalador ---
; LZMA2/ultra64 para menor tamanho possível.
; SolidCompression agrupa tudo em um stream único (mais compacto).
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=4

; --- Permissões ---
; PrivilegesRequired=lowest = não exige "Executar como Administrador"
; OverridesAllowed=dialog = permite o usuário escolher instalar para todos
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

; --- Comportamento do wizard ---
DisableProgramGroupPage=yes
DisableWelcomePage=no
ShowLanguageDialog=yes

; --- Desinstalação ---
UninstallDisplayName={#MyAppName}
CreateUninstallRegKey=yes

; --- Compatibilidade ---
; Requer Windows 10+ 64-bit
MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; --- Idiomas do wizard de instalação ---
[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

; --- Opções apresentadas ao usuário durante instalação ---
[Tasks]
Name: "desktopicon"; Description: "Criar atalho na &Área de Trabalho"; GroupDescription: "Atalhos:"; 
Name: "quicklaunchicon"; Description: "Criar atalho na &Barra de Tarefas"; GroupDescription: "Atalhos:"
Name: "contextmenu"; Description: "Adicionar ao menu de contexto do Windows (botão direito)"; GroupDescription: "Integração com o sistema:"; 
Name: "contextmenu\folder"; Description: "Compactar pasta com Zipador"
Name: "contextmenu\zipfile"; Description: "Descompactar ZIP com Zipador"

; --- Arquivos a instalar ---
; ignoreversion = sempre substituir, mesmo se versão for igual
[Files]
Source: "Zipador.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "zipador.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "LICENCA.txt"; DestDir: "{app}"; Flags: ignoreversion

; --- Atalhos criados pelo instalador ---
[Icons]
; Menu Iniciar
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\zipador.ico"; Comment: "{#MyAppDescription}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"; IconFilename: "{app}\zipador.ico"
; Área de Trabalho
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\zipador.ico"; Comment: "{#MyAppDescription}"; Tasks: desktopicon
; Barra de Tarefas
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\zipador.ico"; Tasks: quicklaunchicon

; --- Registro do Windows ---
; Integra o Zipador ao menu de contexto (botão direito) e salva
; metadados do app no registro para consulta programática.
[Registry]
; Menu de contexto: Compactar pasta
Root: HKCU; Subkey: "Software\Classes\Directory\shell\ZipadorCompactar"; ValueType: string; ValueName: ""; ValueData: "Compactar com Zipador"; Tasks: contextmenu\folder; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Directory\shell\ZipadorCompactar"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\zipador.ico"""; Tasks: contextmenu\folder
Root: HKCU; Subkey: "Software\Classes\Directory\shell\ZipadorCompactar\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%V"""; Tasks: contextmenu\folder

; Menu de contexto: Compactar pasta (background - dentro de uma pasta)
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\ZipadorCompactar"; ValueType: string; ValueName: ""; ValueData: "Compactar esta pasta com Zipador"; Tasks: contextmenu\folder; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\ZipadorCompactar"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\zipador.ico"""; Tasks: contextmenu\folder
Root: HKCU; Subkey: "Software\Classes\Directory\Background\shell\ZipadorCompactar\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%V"""; Tasks: contextmenu\folder

; Menu de contexto: Descompactar ZIP
Root: HKCU; Subkey: "Software\Classes\.zip\shell\ZipadorDescompactar"; ValueType: string; ValueName: ""; ValueData: "Descompactar com Zipador"; Tasks: contextmenu\zipfile; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\.zip\shell\ZipadorDescompactar"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\zipador.ico"""; Tasks: contextmenu\zipfile
Root: HKCU; Subkey: "Software\Classes\.zip\shell\ZipadorDescompactar\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExeName}"" ""%V"""; Tasks: contextmenu\zipfile

; Registro de informações do app
Root: HKCU; Subkey: "Software\{#MyAppPublisher}\{#MyAppName}"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\{#MyAppPublisher}\{#MyAppName}"; ValueType: string; ValueName: "Version"; ValueData: "{#MyAppVersion}"
Root: HKCU; Subkey: "Software\{#MyAppPublisher}\{#MyAppName}"; ValueType: string; ValueName: "Developer"; ValueData: "{#MyAppDeveloper}"
Root: HKCU; Subkey: "Software\{#MyAppPublisher}\{#MyAppName}"; ValueType: string; ValueName: "Contact"; ValueData: "{#MyAppContact}"
Root: HKCU; Subkey: "Software\{#MyAppPublisher}\{#MyAppName}"; ValueType: string; ValueName: "Copyright"; ValueData: "{#MyAppCopyright}"

; --- Ação pós-instalação ---
; Oferece abrir o Zipador ao finalizar o wizard.
[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Abrir {#MyAppName}"; Flags: nowait postinstall skipifsilent

; --- Limpeza na desinstalação ---
; Remove todo o diretório de instalação, incluindo logs/cache.
[UninstallDelete]
Type: filesandordirs; Name: "{app}"

; --- Mensagens customizadas do wizard ---
[Messages]
brazilianportuguese.WelcomeLabel1=Bem-vindo ao Assistente de Instalação do {#MyAppName}
brazilianportuguese.WelcomeLabel2=Este assistente irá instalar o {#MyAppName} {#MyAppVersion} no seu computador.%n%n{#MyAppDescription}%n%nDesenvolvido por {#MyAppDeveloper}%n%nRecomenda-se fechar todos os outros programas antes de continuar.
brazilianportuguese.FinishedHeadingLabel=Instalação do {#MyAppName} concluída!
brazilianportuguese.FinishedLabel=O {#MyAppName} foi instalado com sucesso no seu computador.%n%n\u00a9 2026 {#MyAppDeveloper} - {#MyAppPublisher}%nContato: {#MyAppContact}%n%nClique em Concluir para fechar o assistente.

; --- Código Pascal (Inno Setup scripting) ---
; Detecta se o Zipador já está instalado e oferece desinstalar
; a versão anterior automaticamente antes de instalar a nova.
[Code]
// Verificar se já está instalado e oferecer desinstalação
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
  UninstallKey: String;
  UninstallString: String;
begin
  Result := True;
  UninstallKey := 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{#SetupSetting("AppId")}_is1';

  if RegQueryStringValue(HKCU, UninstallKey, 'UninstallString', UninstallString) then
  begin
    if MsgBox('{#MyAppName} já está instalado.' + #13#10 + #13#10 +
              'Deseja desinstalar a versão anterior e instalar a nova?',
              mbConfirmation, MB_YESNO) = IDYES then
    begin
      Exec(RemoveQuotes(UninstallString), '/SILENT', '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
    end
    else
    begin
      Result := False;
    end;
  end;
end;
