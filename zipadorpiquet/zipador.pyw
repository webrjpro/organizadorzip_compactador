#!/usr/bin/env pythonw
# -*- coding: utf-8 -*-
# =============================================================================
#
#   Zipador de Alta Performance  v1.0.0
#   Copyright (C) 2026  Carlos Antonio de Oliveira Piquet
#   Todos os direitos reservados.
#
#   Desenvolvedor : Carlos Antonio de Oliveira Piquet
#   Email         : carlospiquet.projetos@gmail.com
#   Publicação    : Piquet Software
#
#   AVISO LEGAL:
#   Este software é propriedade exclusiva de Carlos Antonio de Oliveira Piquet.
#   É ESTRITAMENTE PROIBIDO copiar, modificar, redistribuir, descompilar,
#   fazer engenharia reversa, ou utilizar qualquer parte deste código sem
#   autorização prévia e por escrito do autor. Violações serão perseguidas
#   nos termos da Lei nº 9.609/98 (Lei do Software) e Lei nº 9.610/98
#   (Lei de Direitos Autorais) do Brasil, além de tratados internacionais.
#
#   UNAUTHORIZED COPYING, MODIFICATION, DISTRIBUTION, DECOMPILATION OR
#   REVERSE ENGINEERING OF THIS SOFTWARE IS STRICTLY PROHIBITED.
#   ALL RIGHTS RESERVED UNDER BRAZILIAN LAW 9.609/98 AND 9.610/98.
#
# =============================================================================
"""
Zipador de Alta Performance — v1.0.0
=====================================

Interface gráfica (tkinter) para compactar e descompactar arquivos ZIP
com suporte a caminhos longos (>260 caracteres no Windows).

Características Principais
--------------------------
- Compactação e descompactação multi-thread com ThreadPoolExecutor
- Modo Turbo (compressão mínima + máximo de threads)
- Streaming por chunks de 8 MB — suporta arquivos de qualquer tamanho
  sem estourar RAM
- Interface dark theme responsiva (clam + paleta personalizada)
- Internacionalização (i18n): PT-BR, EN, ES — seleção por bandeiras
- Proteção por HWID (Hardware ID) com licenciamento vinculado à máquina
- Marca d'água de copyright embarcada nos ZIPs criados
- Verificação anti-tampering do executável PyInstaller
- Suporte a caminhos longos Windows (\\\\?\\) sem limite de 260 chars
- Sanitização de segurança: proteção contra Path Traversal (ZIPs
  maliciosos com ../../), caracteres proibidos no Windows, e limpeza
  automática de ZIPs parciais em caso de falha
- Log rate-limited (batch flush 50ms) para evitar travamento da GUI

Arquitetura
-----------
- ``ProtecaoSoftware``   — Licenciamento HWID + anti-tampering
- ``Zipador``            — Motor de compactação multi-thread
- ``Deszipador``         — Motor de descompactação multi-thread
- ``iniciar_gui()``      — Construção da interface e bindings
- Módulo de segurança    — ``_nome_seguro()``, ``_validar_caminho_seguro()``
- Sistema i18n           — Dicionário ``TRADUCOES`` × 3 idiomas

Formato do Arquivo
------------------
- Entrada: extensão ``.pyw`` = abre SEM janela do CMD/terminal
- Build: PyInstaller ``--onefile --windowed``
- Instalador: Inno Setup 6 com EULA, menu de contexto e registro

Requisitos
----------
- Python 3.10+ (testado em 3.13.6)
- Windows 10/11 (64-bit)
- Bibliotecas: apenas stdlib (tkinter, zipfile, hashlib, etc.)

Copyright (C) 2026 Carlos Antonio de Oliveira Piquet
Todos os direitos reservados.
"""

__title__     = "Zipador de Alta Performance"
__version__   = "1.0.0"
__author__    = "Carlos Antonio de Oliveira Piquet"
__email__     = "carlospiquet.projetos@gmail.com"
__copyright__ = "Copyright (C) 2026 Carlos Antonio de Oliveira Piquet"
__license__   = "Proprietário - Todos os direitos reservados"
__publisher__ = "Piquet Software"

import os
import sys
import zipfile
import time
import hashlib
import platform
import uuid
import json
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock, Thread
from io import BytesIO
from datetime import datetime

# ============================================================
# Configurações Globais
# ============================================================

TAMANHO_BUFFER = 8 * 1024 * 1024
"""int: Tamanho do buffer de leitura/escrita em bytes (8 MB).
Usado na compactação (``comprimir_arquivo_mem``) e na descompactação
(``_extrair_membro_direto``) para streaming por chunks sem estourar RAM."""

MAX_THREADS_PADRAO = os.cpu_count() or 4
"""int: Quantidade padrão de threads paralelas.
Detectada automaticamente via ``os.cpu_count()``. Fallback = 4.
O Modo Turbo dobra este valor (mínimo 16)."""

# ============================================================
# Sistema de Proteção e Licenciamento
# ============================================================
class ProtecaoSoftware:
    """
    Sistema de proteção contra cópia e uso indevido.
    Gera fingerprint único do hardware (HWID) e vincula a licença à máquina.
    """

    _CHAVE_OFUSCACAO = b"PiquetSoftware2026ZipadorHP"
    _ARQUIVO_LICENCA = ".zipador.lic"

    @staticmethod
    def obter_hwid() -> str:
        """Gera um fingerprint único da máquina baseado em hardware."""
        componentes = []

        # MAC Address
        try:
            mac = uuid.getnode()
            componentes.append(f"MAC:{mac:012x}")
        except Exception:
            componentes.append("MAC:unknown")

        # Nome do processador
        try:
            componentes.append(f"CPU:{platform.processor()}")
        except Exception:
            componentes.append("CPU:unknown")

        # Nome da máquina
        try:
            componentes.append(f"NODE:{platform.node()}")
        except Exception:
            componentes.append("NODE:unknown")

        # Sistema operacional
        try:
            componentes.append(f"OS:{platform.system()}-{platform.machine()}")
        except Exception:
            componentes.append("OS:unknown")

        # Serial do disco (Windows)
        if os.name == 'nt':
            try:
                import subprocess
                result = subprocess.run(
                    ['wmic', 'diskdrive', 'get', 'serialnumber'],
                    capture_output=True, text=True, timeout=5,
                    creationflags=0x08000000  # CREATE_NO_WINDOW
                )
                serials = [l.strip() for l in result.stdout.strip().split('\n')
                          if l.strip() and l.strip() != 'SerialNumber']
                if serials:
                    componentes.append(f"DISK:{serials[0]}")
            except Exception:
                pass

        # Gerar hash único
        dados = "|".join(componentes)
        hwid = hashlib.sha256(dados.encode('utf-8')).hexdigest().upper()
        return f"{hwid[:8]}-{hwid[8:16]}-{hwid[16:24]}-{hwid[24:32]}"

    @classmethod
    def _caminho_licenca(cls) -> str:
        """Retorna o caminho do arquivo de licença."""
        if os.name == 'nt':
            base = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        else:
            base = os.path.expanduser('~')
        diretorio = os.path.join(base, 'PiquetSoftware', 'Zipador')
        os.makedirs(diretorio, exist_ok=True)
        return os.path.join(diretorio, cls._ARQUIVO_LICENCA)

    @classmethod
    def _gerar_token(cls, hwid: str) -> str:
        """Gera token de licença vinculado ao HWID."""
        dados = f"{hwid}|{__author__}|{__version__}|{__copyright__}"
        salt = cls._CHAVE_OFUSCACAO
        token = hashlib.pbkdf2_hmac('sha256', dados.encode(), salt, 100000)
        return token.hex()

    @classmethod
    def _verificar_integridade_exe(cls) -> bool:
        """Verifica se o executável não foi adulterado."""
        try:
            if getattr(sys, 'frozen', False):
                exe_path = sys.executable
                tamanho = os.path.getsize(exe_path)
                # Verifica se o tamanho é razoável (entre 5MB e 50MB)
                if tamanho < 5_000_000 or tamanho > 50_000_000:
                    return False
                # Verifica nome do executável
                nome_exe = os.path.basename(exe_path).lower()
                if 'zipador' not in nome_exe:
                    return False
                # Verifica que o PyInstaller bootloader está presente
                # (executáveis genuínos do PyInstaller contêm esta marca)
                with open(exe_path, 'rb') as f:
                    conteudo = f.read()
                    if b'MEI\x00' not in conteudo and b'PYZ\x00' not in conteudo:
                        return False
                # Salvar hash do exe na licença para detecção de alteração
                exe_hash = hashlib.sha256(conteudo).hexdigest()
                caminho_lic = cls._caminho_licenca()
                if os.path.exists(caminho_lic):
                    try:
                        with open(caminho_lic, 'r', encoding='utf-8') as f:
                            lic = json.load(f)
                        hash_salvo = lic.get('_exe_hash')
                        if hash_salvo and hash_salvo != exe_hash:
                            # Hash mudou = exe foi modificado após instalação
                            # Permitir na primeira vez (atualização legítima)
                            lic['_exe_hash'] = exe_hash
                            with open(caminho_lic, 'w', encoding='utf-8') as f:
                                json.dump(lic, f, ensure_ascii=False, indent=2)
                        elif not hash_salvo:
                            lic['_exe_hash'] = exe_hash
                            with open(caminho_lic, 'w', encoding='utf-8') as f:
                                json.dump(lic, f, ensure_ascii=False, indent=2)
                    except Exception:
                        pass
        except Exception:
            pass
        return True

    @classmethod
    def ativar_licenca(cls) -> dict:
        """
        Ativa automaticamente a licença na primeira execução.
        Vincula ao hardware da máquina atual.
        """
        hwid = cls.obter_hwid()
        token = cls._gerar_token(hwid)
        caminho = cls._caminho_licenca()

        licenca = {
            "software": __title__,
            "versao": __version__,
            "desenvolvedor": __author__,
            "email": __email__,
            "publisher": __publisher__,
            "copyright": __copyright__,
            "hwid": hwid,
            "token": token,
            "data_ativacao": datetime.now().isoformat(),
            "maquina": platform.node(),
            "sistema": f"{platform.system()} {platform.release()}",
            "aviso_legal": (
                "Esta licença é pessoal e intransferível. "
                "Vinculada exclusivamente a este hardware. "
                "A redistribuição não autorizada é crime previsto na "
                "Lei 9.609/98 (Lei do Software) do Brasil."
            )
        }

        # Gerar checksum do arquivo de licença
        lic_json = json.dumps(licenca, ensure_ascii=False, indent=2)
        checksum = hashlib.sha256(
            (lic_json + cls._CHAVE_OFUSCACAO.decode()).encode()
        ).hexdigest()
        licenca["_checksum"] = checksum

        try:
            with open(caminho, 'w', encoding='utf-8') as f:
                json.dump(licenca, f, ensure_ascii=False, indent=2)
            # Ocultar arquivo no Windows
            if os.name == 'nt':
                try:
                    import subprocess
                    subprocess.run(
                        ['attrib', '+H', '+S', caminho],
                        capture_output=True, timeout=5,
                        creationflags=0x08000000
                    )
                except Exception:
                    pass
        except Exception:
            pass

        return licenca

    @classmethod
    def validar_licenca(cls) -> tuple:
        """
        Valida a licença existente.
        Retorna (valido: bool, mensagem: str, licenca: dict|None)
        """
        caminho = cls._caminho_licenca()

        # Se não existe, ativar automaticamente
        if not os.path.exists(caminho):
            lic = cls.ativar_licenca()
            return True, "Licença ativada com sucesso.", lic

        try:
            with open(caminho, 'r', encoding='utf-8') as f:
                licenca = json.load(f)
        except (json.JSONDecodeError, OSError):
            # Arquivo corrompido - reativar
            lic = cls.ativar_licenca()
            return True, "Licença reativada.", lic

        # Verificar checksum
        checksum_salvo = licenca.pop("_checksum", None)
        lic_json = json.dumps(licenca, ensure_ascii=False, indent=2)
        checksum_calc = hashlib.sha256(
            (lic_json + cls._CHAVE_OFUSCACAO.decode()).encode()
        ).hexdigest()

        if checksum_salvo != checksum_calc:
            return False, "ALERTA: Arquivo de licença adulterado!", None

        # Verificar HWID
        hwid_atual = cls.obter_hwid()
        if licenca.get("hwid") != hwid_atual:
            return False, (
                "ALERTA: Esta licença pertence a outra máquina!\n"
                "O software NÃO pode ser copiado entre computadores.\n\n"
                f"HWID esperado: {licenca.get('hwid', 'N/A')}\n"
                f"HWID atual: {hwid_atual}\n\n"
                "Contato: carlospiquet.projetos@gmail.com"
            ), None

        # Verificar token
        token_esperado = cls._gerar_token(hwid_atual)
        if licenca.get("token") != token_esperado:
            return False, "ALERTA: Token de licença inválido!", None

        licenca["_checksum"] = checksum_salvo
        return True, "Licença válida.", licenca

    @classmethod
    def verificar_protecao(cls) -> bool:
        """
        Executa todas as verificações de proteção.
        Retorna True se tudo estiver OK.
        """
        # 1. Verificar integridade do executável
        if not cls._verificar_integridade_exe():
            messagebox.showerror(
                "⚠ Proteção do Software",
                "ALERTA DE SEGURANÇA!\n\n"
                "O executável foi modificado ou adulterado.\n"
                "Esta cópia pode ser ilegal ou conter malware.\n\n"
                f"Desenvolvedor: {__author__}\n"
                f"Contato: {__email__}\n\n"
                "Baixe a versão oficial em:\n"
                "carlospiquet.projetos@gmail.com"
            )
            return False

        # 2. Validar licença
        valido, msg, lic = cls.validar_licenca()
        if not valido:
            messagebox.showerror(
                "⚠ Licença Inválida",
                f"{msg}\n\n"
                f"© {__author__}\n"
                f"Contato: {__email__}"
            )
            return False

        return True


# ============================================================
# Watermark / Marca d'água para ZIPs criados
# ============================================================
def gerar_watermark_zip() -> str:
    """Gera comentário de copyright para embarcação no ZIP."""
    hwid = ProtecaoSoftware.obter_hwid()
    timestamp = datetime.now().isoformat()
    marca = (
        f"============================================\n"
        f"  Criado com {__title__} v{__version__}\n"
        f"  {__copyright__}\n"
        f"  {__publisher__}\n"
        f"  Contato: {__email__}\n"
        f"============================================\n"
        f"  Data: {timestamp}\n"
        f"  HWID: {hwid}\n"
        f"  Maquina: {platform.node()}\n"
        f"============================================\n"
        f"  Este arquivo foi gerado por software\n"
        f"  proprietario licenciado. A copia ou\n"
        f"  redistribuicao nao autorizada do\n"
        f"  software e proibida por lei.\n"
        f"============================================"
    )
    return marca


# ============================================================
# Suporte a caminhos longos no Windows
# ============================================================
def caminho_longo(caminho: str) -> str:
    """Converte um caminho para formato longo do Windows (\\\\?\\).

    Permite que o sistema operacional aceite caminhos com mais de
    260 caracteres (MAX_PATH). Em outros SOs, retorna sem alteração.

    Args:
        caminho: Caminho de arquivo/diretório.

    Returns:
        Caminho com prefixo \\\\?\\ no Windows, ou inalterado no Linux/Mac.
    """
    if os.name != 'nt':
        return caminho
    caminho = os.path.abspath(caminho)
    if caminho.startswith('\\\\?\\'):
        return caminho
    if caminho.startswith('\\\\'):
        return '\\\\?\\UNC\\' + caminho[2:]
    return '\\\\?\\' + caminho


def caminho_curto(caminho: str) -> str:
    """Remove o prefixo de caminho longo (\\\\?\\) para exibição.

    Operação inversa de ``caminho_longo()``. Usada em logs e mensagens
    para exibir caminhos legíveis ao usuário.

    Args:
        caminho: Caminho possivelmente com prefixo \\\\?\\.

    Returns:
        Caminho sem prefixo de caminho longo.
    """
    if caminho.startswith('\\\\?\\UNC\\'):
        return '\\\\' + caminho[8:]
    if caminho.startswith('\\\\?\\'):
        return caminho[4:]
    return caminho


# ============================================================
# Scanner de arquivos
# ============================================================
def escanear_diretorio(raiz: str):
    """Escaneia recursivamente um diretório e retorna todos os arquivos.

    Usa ``os.scandir()`` para performance. Ignora symlinks para segurança.
    Trata erros de permissão sem abortar o escaneamento.

    Args:
        raiz: Caminho absoluto do diretório raiz a escanear.

    Returns:
        tuple: (arquivos, erros)
            - arquivos: lista de (caminho_absoluto, caminho_relativo, tamanho)
            - erros: lista de strings descrevendo falhas de acesso
    """
    raiz_longo = caminho_longo(raiz)
    arquivos = []
    erros = []

    def _escanear(diretorio, prefixo_relativo):
        """Escaneia recursivamente um diretório, populando `arquivos` e `erros`."""
        try:
            with os.scandir(diretorio) as entradas:
                for entrada in entradas:
                    nome = entrada.name
                    caminho_rel = os.path.join(prefixo_relativo, nome) if prefixo_relativo else nome
                    try:
                        if entrada.is_symlink():
                            continue
                        if entrada.is_dir(follow_symlinks=False):
                            _escanear(entrada.path, caminho_rel)
                        elif entrada.is_file(follow_symlinks=False):
                            try:
                                tamanho = entrada.stat(follow_symlinks=False).st_size
                            except OSError:
                                tamanho = 0
                            arquivos.append((entrada.path, caminho_rel, tamanho))
                    except PermissionError:
                        erros.append(f"[PERM] {caminho_curto(entrada.path)}")
                    except OSError:
                        erros.append(f"[ERRO] {caminho_curto(entrada.path)}")
        except PermissionError:
            erros.append(f"[PERM] {caminho_curto(diretorio)}")
        except OSError:
            erros.append(f"[ERRO] {caminho_curto(diretorio)}")

    _escanear(raiz_longo, "")
    return arquivos, erros


def comprimir_arquivo_mem(caminho_abs: str):
    """Lê um arquivo inteiro para memória em chunks de TAMANHO_BUFFER.

    Usado internamente pelo ``Zipador`` para arquivos ≤ 100 MB que podem
    ser comprimidos em paralelo (ThreadPoolExecutor).

    Args:
        caminho_abs: Caminho absoluto do arquivo a ler.

    Returns:
        tuple: (bytes_conteudo, None) em caso de sucesso, ou
               (None, mensagem_erro) em caso de falha.
    """
    dados = BytesIO()
    try:
        with open(caminho_abs, 'rb') as f:
            while True:
                bloco = f.read(TAMANHO_BUFFER)
                if not bloco:
                    break
                dados.write(bloco)
    except (PermissionError, OSError) as e:
        return None, str(e)
    return dados.getvalue(), None


# ============================================================
# Formatação
# ============================================================
# ============================================================
# Segurança: proteção contra path traversal e nomes inválidos
# ============================================================
_CHARS_PROIBIDOS_WIN = '<>:"|?*'
_CHARS_CONTROLE = set(chr(c) for c in range(32))


def _nome_seguro(nome_arquivo: str) -> str:
    """Sanitiza nome de arquivo removendo caracteres proibidos no Windows
    e impedindo path traversal (../../)."""
    # Remover path traversal absoluto
    nome_arquivo = nome_arquivo.replace('\\', '/')
    # Remover componentes ../ que tentam escapar
    partes = nome_arquivo.split('/')
    partes_seguras = []
    for p in partes:
        if p in ('', '.', '..'):
            continue
        # Remover caracteres proibidos no Windows
        p_limpo = ''.join(
            c for c in p
            if c not in _CHARS_PROIBIDOS_WIN and c not in _CHARS_CONTROLE
        )
        # Remover trailing dots/spaces (Windows ignora mas pode causar bugs)
        p_limpo = p_limpo.rstrip('. ')
        if p_limpo:
            partes_seguras.append(p_limpo)
    return '/'.join(partes_seguras)


def _validar_caminho_seguro(nome_zip: str, destino: str) -> bool:
    """Verifica se o caminho extraído NÃO escapa do diretório destino.
    Previne ataques de path traversal via ZIPs maliciosos."""
    caminho_abs = os.path.normpath(os.path.join(destino, nome_zip))
    destino_abs = os.path.normpath(destino)
    # No Windows, comparar case-insensitive
    if os.name == 'nt':
        return caminho_abs.lower().startswith(destino_abs.lower() + os.sep) or \
               caminho_abs.lower() == destino_abs.lower()
    return caminho_abs.startswith(destino_abs + os.sep) or \
           caminho_abs == destino_abs


def formatar_tamanho(tamanho_bytes: int) -> str:
    """Formata bytes em unidade legível (B, KB, MB, GB).

    Args:
        tamanho_bytes: Tamanho em bytes.

    Returns:
        String formatada com unidade adequada.
        Ex.: ``formatar_tamanho(1536)`` → ``'1.5 KB'``
    """
    if tamanho_bytes < 1024:
        return f"{tamanho_bytes} B"
    elif tamanho_bytes < 1024 ** 2:
        return f"{tamanho_bytes / 1024:.1f} KB"
    elif tamanho_bytes < 1024 ** 3:
        return f"{tamanho_bytes / 1024**2:.1f} MB"
    else:
        return f"{tamanho_bytes / 1024**3:.2f} GB"


def formatar_tempo(segundos: float) -> str:
    """Formata duração em segundos para formato legível.

    Args:
        segundos: Duração em segundos (float).

    Returns:
        String formatada: ``'3.2s'``, ``'2m 15.0s'``, ou ``'1h 30m 5s'``.
    """
    if segundos < 60:
        return f"{segundos:.1f}s"
    elif segundos < 3600:
        m, s = divmod(segundos, 60)
        return f"{int(m)}m {s:.1f}s"
    else:
        h, resto = divmod(segundos, 3600)
        m, s = divmod(resto, 60)
        return f"{int(h)}h {int(m)}m {s:.0f}s"


# ============================================================
# Motor de COMPACTAÇÃO
# ============================================================
class Zipador:
    """Motor de compactação ZIP multi-thread de alta performance.

    Estratégia de compactação:
    - Arquivos ≤ 100 MB: lidos para memória em paralelo via
      ThreadPoolExecutor, depois escritos sequencialmente no ZIP
      (ZipFile não é thread-safe para escrita)
    - Arquivos > 100 MB: escritos sequencialmente direto do disco
      com ``zf.write()`` para não estourar RAM

    Suporta:
    - Níveis de compressão 0–9 (ZIP_DEFLATED)
    - Cancelamento cooperativo via flag ``cancelado``
    - Callbacks de progresso e log para atualizar a GUI
    - Watermark de copyright no comentário do ZIP
    - Detecção de caminhos longos (>260 chars)
    - ZIP64 para arquivos >4 GB

    Args:
        nivel_compressao: 0 (sem compressão) a 9 (máximo). Padrão: 6.
        num_threads: Número de workers paralelos. Padrão: ``os.cpu_count()``.
        callback_progresso: Função(bytes_feitos, bytes_total, arqs_feitos, arqs_total).
        callback_log: Função(mensagem_str) para registrar eventos.
    """

    def __init__(self, nivel_compressao=6, num_threads=None,
                 callback_progresso=None, callback_log=None):
        """Inicializa o motor de compactação com parâmetros configurados."""
        self.nivel_compressao = nivel_compressao
        self.num_threads = num_threads or MAX_THREADS_PADRAO
        self.lock = Lock()
        self.arquivos_processados = 0
        self.bytes_processados = 0
        self.total_arquivos = 0
        self.total_bytes = 0
        self.erros = []
        self.cancelado = False
        self._cb_prog = callback_progresso
        self._cb_log = callback_log

    def cancelar(self):
        """Solicita o cancelamento cooperativo da operação em andamento.

        A flag ``self.cancelado`` é verificada entre cada arquivo processado.
        O cancelamento não é instantâneo — o arquivo atual termina antes.
        """
        self.cancelado = True

    def log(self, msg):
        """Envia mensagem ao callback de log, se configurado."""
        if self._cb_log:
            self._cb_log(msg)

    def _progresso(self, tamanho_arquivo):
        """Atualiza contadores de progresso de forma thread-safe.

        Args:
            tamanho_arquivo: Tamanho em bytes do arquivo recém-processado.
        """
        with self.lock:
            self.arquivos_processados += 1
            self.bytes_processados += tamanho_arquivo
            if self._cb_prog:
                self._cb_prog(
                    self.bytes_processados, self.total_bytes,
                    self.arquivos_processados, self.total_arquivos
                )

    def zipar(self, origem: str, destino: str) -> dict:
        """Compacta uma pasta ou arquivo em formato ZIP.

        Args:
            origem: Caminho absoluto da pasta ou arquivo a compactar.
            destino: Caminho absoluto do arquivo .zip de saída.

        Returns:
            dict com chaves:
                - ``sucesso`` (bool): Se a operação completou sem erros fatais.
                - ``cancelado`` (bool): Se foi cancelado pelo usuário.
                - ``destino`` (str): Caminho do ZIP criado.
                - ``total_bytes`` (int): Total de bytes dos arquivos originais.
                - ``zip_bytes`` (int): Tamanho final do ZIP em bytes.
                - ``taxa_compressao`` (float): Percentual de redução.
                - ``velocidade`` (float): Bytes/segundo de processamento.
                - ``duracao`` (float): Tempo total em segundos.
                - ``arquivos`` (int): Quantidade de arquivos processados.
                - ``erros`` (int): Quantidade de erros não-fatais.
                - ``caminhos_longos`` (int): Qtd de caminhos >260 chars.
                - ``maior_caminho`` (int): Comprimento do maior caminho.

        Raises:
            FileNotFoundError: Se a origem não existir.
        """
        inicio = time.perf_counter()
        self.cancelado = False
        self.erros = []
        self.arquivos_processados = 0
        self.bytes_processados = 0

        origem = os.path.abspath(origem)
        nome_base = os.path.basename(origem.rstrip(os.sep))
        destino = os.path.abspath(destino)

        self.log(f"Origem: {caminho_curto(origem)}")
        self.log(f"Destino: {caminho_curto(destino)}")
        self.log(f"Compressão: nível {self.nivel_compressao} | Threads: {self.num_threads}")

        origem_longo = caminho_longo(origem)
        if not os.path.exists(origem_longo):
            raise FileNotFoundError(f"Origem não encontrada: {origem}")

        self.log("Escaneando arquivos...")

        if os.path.isfile(origem_longo):
            tamanho = os.path.getsize(origem_longo)
            arquivos = [(origem_longo, nome_base, tamanho)]
            erros_scan = []
            nome_base_dir = ""
        else:
            arquivos, erros_scan = escanear_diretorio(origem)
            nome_base_dir = nome_base

        self.total_arquivos = len(arquivos)
        self.total_bytes = sum(t for _, _, t in arquivos)

        self.log(f"Encontrados: {self.total_arquivos} arquivos ({formatar_tamanho(self.total_bytes)})")

        if erros_scan:
            for e in erros_scan[:5]:
                self.log(f"  \u26a0 {e}")

        if self.total_arquivos == 0:
            self.log("Nenhum arquivo para compactar.")
            return {"sucesso": True, "destino": destino, "total_bytes": 0,
                    "zip_bytes": 0, "taxa_compressao": 0, "velocidade": 0,
                    "duracao": 0, "arquivos": 0, "erros": 0}

        arquivos.sort(key=lambda x: x[2], reverse=True)
        self.log("Compactando...")

        destino_longo = caminho_longo(destino)
        dir_destino = os.path.dirname(destino_longo)
        if dir_destino:
            os.makedirs(dir_destino, exist_ok=True)

        LIMITE = 100 * 1024 * 1024
        pequenos = [(a, r, t) for a, r, t in arquivos if t <= LIMITE]
        grandes = [(a, r, t) for a, r, t in arquivos if t > LIMITE]

        with zipfile.ZipFile(destino_longo, 'w',
                             compression=zipfile.ZIP_DEFLATED,
                             compresslevel=self.nivel_compressao,
                             allowZip64=True) as zf:

            if pequenos:
                def proc(item):
                    """Lê um arquivo para memória e prepara para inserção no ZIP."""
                    ca, cr, tam = item
                    if nome_base_dir:
                        nz = nome_base_dir + '/' + cr.replace('\\', '/')
                    else:
                        nz = cr.replace('\\', '/')
                    dados, erro = comprimir_arquivo_mem(ca)
                    return (nz, dados, tam, erro)

                with ThreadPoolExecutor(max_workers=self.num_threads) as ex:
                    futs = {ex.submit(proc, i): i for i in pequenos}
                    for f in as_completed(futs):
                        if self.cancelado:
                            ex.shutdown(wait=False, cancel_futures=True)
                            return {"sucesso": False, "cancelado": True}
                        nz, dados, tam, erro = f.result()
                        if erro:
                            self.erros.append(f"[ERRO] {nz}: {erro}")
                            self._progresso(tam)
                            continue
                        with self.lock:
                            zf.writestr(nz, dados)
                        self._progresso(tam)

            for ca, cr, tam in grandes:
                if self.cancelado:
                    return {"sucesso": False, "cancelado": True}
                if nome_base_dir:
                    nz = nome_base_dir + '/' + cr.replace('\\', '/')
                else:
                    nz = cr.replace('\\', '/')
                try:
                    zf.write(ca, nz)
                except (PermissionError, OSError) as e:
                    self.erros.append(f"[ERRO] {nz}: {e}")
                self._progresso(tam)

            # ---- Watermark: Copyright embarcado no ZIP ----
            try:
                zf.comment = gerar_watermark_zip().encode('utf-8')
            except Exception:
                pass

        fim = time.perf_counter()
        duracao = fim - inicio
        tamanho_zip = os.path.getsize(destino_longo)
        taxa = (1 - tamanho_zip / self.total_bytes) * 100 if self.total_bytes > 0 else 0
        velocidade = self.total_bytes / duracao if duracao > 0 else 0

        # Detectar caminhos longos (> 260 chars) que o Windows Explorer não suporta
        caminhos_longos = 0
        maior_caminho = 0
        try:
            with zipfile.ZipFile(destino_longo, 'r') as zf_check:
                for nome in zf_check.namelist():
                    if len(nome) > 260:
                        caminhos_longos += 1
                    if len(nome) > maior_caminho:
                        maior_caminho = len(nome)
        except Exception:
            pass

        return {
            "sucesso": True,
            "destino": caminho_curto(destino),
            "total_bytes": self.total_bytes,
            "zip_bytes": tamanho_zip,
            "taxa_compressao": taxa,
            "velocidade": velocidade,
            "duracao": duracao,
            "arquivos": self.arquivos_processados,
            "erros": len(self.erros),
            "caminhos_longos": caminhos_longos,
            "maior_caminho": maior_caminho,
        }


# ============================================================
# Motor de DESCOMPACTAÇÃO
# ============================================================
class Deszipador:
    """Motor de descompactação ZIP multi-thread de alta performance.

    Estratégia de descompactação:
    - Arquivos ≤ 50 MB: distribuídos em lotes (1 por thread), cada thread
      abre o ZIP uma única vez e extrai seu lote inteiro
    - Arquivos > 50 MB: extraídos sequencialmente via streaming (chunks
      de 8 MB) para não estourar RAM

    Segurança:
    - Proteção contra Path Traversal (../../) via ``_nome_seguro()``
    - Sanitização de caracteres proibidos no Windows
    - Validação de destino via ``_validar_caminho_seguro()``
    - Thread-safety: cada thread abre seu próprio ZipFile

    Args:
        num_threads: Número de workers paralelos. Padrão: ``os.cpu_count()``.
        callback_progresso: Função(bytes_feitos, bytes_total, arqs_feitos, arqs_total).
        callback_log: Função(mensagem_str) para registrar eventos.
    """

    def __init__(self, num_threads=None,
                 callback_progresso=None, callback_log=None):
        """Inicializa o motor de descompactação com parâmetros configurados."""
        self.num_threads = num_threads or MAX_THREADS_PADRAO
        self.lock = Lock()
        self.arquivos_processados = 0
        self.bytes_processados = 0
        self.total_arquivos = 0
        self.total_bytes = 0
        self.erros = []
        self.cancelado = False
        self._cb_prog = callback_progresso
        self._cb_log = callback_log

    def cancelar(self):
        """Solicita o cancelamento cooperativo da extração em andamento."""
        self.cancelado = True

    def log(self, msg):
        """Envia mensagem ao callback de log, se configurado."""
        if self._cb_log:
            self._cb_log(msg)

    def _progresso(self, tamanho):
        """Atualiza contadores de progresso de forma thread-safe.

        Args:
            tamanho: Tamanho em bytes do arquivo recém-extraído.
        """
        with self.lock:
            self.arquivos_processados += 1
            self.bytes_processados += tamanho
            if self._cb_prog:
                self._cb_prog(
                    self.bytes_processados, self.total_bytes,
                    self.arquivos_processados, self.total_arquivos
                )

    def _extrair_membro_direto(self, zf, info, destino):
        """Extrai um membro do ZIP com suporte a caminhos longos.
        Recebe um ZipFile já aberto (evita reabrir o ZIP para cada arquivo).
        Usa leitura por chunks para não estourar a RAM com arquivos grandes.
        NOTA: Cada thread deve abrir seu próprio ZipFile — NÃO compartilhar
        o mesmo ZipFile entre threads (não é thread-safe)."""
        # ---- FIX 1: Path Traversal ----
        nome_seguro = _nome_seguro(info.filename)
        if not nome_seguro:
            return info.file_size, "nome de arquivo inválido (vazio após sanitização)"

        if not _validar_caminho_seguro(nome_seguro, destino):
            return info.file_size, f"path traversal bloqueado: {info.filename}"

        # ---- FIX 5: Sanitizar nomes para Windows ----
        caminho_saida = os.path.join(destino, nome_seguro.replace('/', os.sep))
        caminho_saida_longo = caminho_longo(caminho_saida)

        if info.is_dir():
            os.makedirs(caminho_saida_longo, exist_ok=True)
            return info.file_size, None

        dir_pai = os.path.dirname(caminho_saida_longo)
        if dir_pai:
            os.makedirs(dir_pai, exist_ok=True)

        try:
            with zf.open(info.filename) as src, \
                 open(caminho_saida_longo, 'wb') as f_out:
                while True:
                    bloco = src.read(TAMANHO_BUFFER)  # 8 MB por vez
                    if not bloco:
                        break
                    f_out.write(bloco)
        except (PermissionError, OSError, zipfile.BadZipFile) as e:
            return info.file_size, str(e)

        return info.file_size, None

    def _processar_lote(self, zip_path, lote, destino):
        """Processa um lote de arquivos usando uma única abertura do ZIP.
        Cada thread abre o ZIP 1x e extrai todos os membros do seu lote.
        FIX 4: Thread-safety — cada thread abre seu próprio ZipFile.
        Nunca compartilhar a mesma instância entre threads."""
        resultados = []
        try:
            with zipfile.ZipFile(caminho_longo(zip_path), 'r') as zf:
                for info in lote:
                    if self.cancelado:
                        break
                    tam, erro = self._extrair_membro_direto(zf, info, destino)
                    resultados.append((info.filename, tam, erro))
        except Exception as e:
            # Se não conseguiu abrir o ZIP, marcar tudo como erro
            for info in lote:
                resultados.append((info.filename, info.file_size, str(e)))
        return resultados

    def deszipar(self, arquivo_zip: str, destino: str) -> dict:
        """Extrai todos os arquivos de um ZIP para o diretório destino.

        Args:
            arquivo_zip: Caminho absoluto do arquivo .zip.
            destino: Caminho absoluto do diretório de saída.

        Returns:
            dict com chaves:
                - ``sucesso`` (bool): Se completou sem erros fatais.
                - ``cancelado`` (bool): Se foi cancelado.
                - ``destino`` (str): Caminho absoluto da extração.
                - ``total_bytes`` (int): Total descompactado em bytes.
                - ``zip_bytes`` (int): Tamanho do ZIP original.
                - ``velocidade`` (float): Bytes/segundo.
                - ``duracao`` (float): Tempo total em segundos.
                - ``arquivos`` (int): Arquivos extraídos.
                - ``erros`` (int): Erros não-fatais.

        Raises:
            FileNotFoundError: Se o ZIP não existir.
        """
        inicio = time.perf_counter()
        self.cancelado = False
        self.erros = []
        self.arquivos_processados = 0
        self.bytes_processados = 0

        arquivo_zip = os.path.abspath(arquivo_zip)
        destino = os.path.abspath(destino)

        self.log(f"Arquivo ZIP: {caminho_curto(arquivo_zip)}")
        self.log(f"Destino: {caminho_curto(destino)}")

        zip_longo = caminho_longo(arquivo_zip)
        if not os.path.exists(zip_longo):
            raise FileNotFoundError(f"ZIP não encontrado: {arquivo_zip}")

        self.log("Lendo conteúdo do ZIP...")

        with zipfile.ZipFile(zip_longo, 'r') as zf:
            membros = zf.infolist()

        # Filtrar apenas arquivos (não diretórios)
        arquivos = [m for m in membros if not m.is_dir()]
        diretorios = [m for m in membros if m.is_dir()]

        self.total_arquivos = len(arquivos)
        self.total_bytes = sum(m.file_size for m in arquivos)

        tamanho_zip = os.path.getsize(zip_longo)
        self.log(f"ZIP: {formatar_tamanho(tamanho_zip)} compactado")
        self.log(f"Conteúdo: {self.total_arquivos} arquivos ({formatar_tamanho(self.total_bytes)})")
        self.log(f"Threads: {self.num_threads}")

        if self.total_arquivos == 0:
            self.log("ZIP vazio.")
            return {"sucesso": True, "destino": destino, "total_bytes": 0,
                    "zip_bytes": tamanho_zip, "duracao": 0, "arquivos": 0, "erros": 0}

        # Criar diretórios primeiro
        dest_longo = caminho_longo(destino)
        os.makedirs(dest_longo, exist_ok=True)
        for d in diretorios:
            dp = os.path.join(destino, d.filename.replace('/', os.sep))
            os.makedirs(caminho_longo(dp), exist_ok=True)

        self.log("Extraindo...")

        # Separar arquivos grandes dos pequenos
        LIMITE = 50 * 1024 * 1024  # 50 MB
        pequenos = [m for m in arquivos if m.file_size <= LIMITE]
        grandes = [m for m in arquivos if m.file_size > LIMITE]

        # Distribuir os pequenos em lotes (1 lote por thread)
        # Cada thread abre o ZIP apenas 1 vez (MUITO mais rápido)
        if pequenos:
            n_threads = min(self.num_threads, len(pequenos))
            lotes = [[] for _ in range(n_threads)]
            for i, m in enumerate(pequenos):
                lotes[i % n_threads].append(m)

            with ThreadPoolExecutor(max_workers=n_threads) as ex:
                futs = {ex.submit(self._processar_lote, arquivo_zip, lote, destino): lote
                        for lote in lotes}
                for f in as_completed(futs):
                    if self.cancelado:
                        ex.shutdown(wait=False, cancel_futures=True)
                        return {"sucesso": False, "cancelado": True}
                    resultados = f.result()
                    for nome, tam, erro in resultados:
                        if erro:
                            self.erros.append(f"[ERRO] {nome}: {erro}")
                        self._progresso(tam)

        # Grandes: extrair sequencialmente com ZIP aberto uma vez
        if grandes:
            with zipfile.ZipFile(zip_longo, 'r') as zf:
                for info in grandes:
                    if self.cancelado:
                        return {"sucesso": False, "cancelado": True}
                    tam, erro = self._extrair_membro_direto(zf, info, destino)
                    if erro:
                        self.erros.append(f"[ERRO] {info.filename}: {erro}")
                    self._progresso(tam)

        fim = time.perf_counter()
        duracao = fim - inicio
        velocidade = self.total_bytes / duracao if duracao > 0 else 0

        return {
            "sucesso": True,
            "destino": caminho_curto(destino),
            "total_bytes": self.total_bytes,
            "zip_bytes": tamanho_zip,
            "velocidade": velocidade,
            "duracao": duracao,
            "arquivos": self.arquivos_processados,
            "erros": len(self.erros),
        }


# ============================================================
# CORES DO TEMA
# ============================================================
# Paleta dark theme inspirada em Catppuccin Mocha + tons roxos.
# Todas as constantes são usadas nos widgets tkinter.
BG       = "#1e1e2e"   # Fundo principal
BG2      = "#282840"   # Fundo dos cards/frames
BG3      = "#313150"   # Fundo de elementos inativos
FG       = "#e0e0e0"   # Texto primário
FG2      = "#a0a0b8"   # Texto secundário / dicas
ACCENT   = "#7c3aed"   # Cor de destaque principal (roxo)
ACC_HOV  = "#9556ff"   # Hover do accent
GREEN    = "#22c55e"   # Sucesso / botão descompactar
GREEN_H  = "#16a34a"   # Hover do green
RED      = "#ef4444"   # Erro / botão cancelar
RED_H    = "#dc2626"   # Hover do red
BORDER   = "#404060"   # Bordas de cards e inputs
INPUT_BG = "#2a2a42"   # Fundo de campos de entrada
PROG_BG  = "#3a3a55"   # Fundo da barra de progresso
ORANGE   = "#f59e0b"   # Modo Turbo



# ============================================================
# SISTEMA DE IDIOMAS / INTERNATIONALIZATION (i18n)
# ============================================================
# O sistema suporta 3 idiomas: PT-BR, EN, ES.
# A preferência é persistida em %LOCALAPPDATA%\PiquetSoftware\Zipador\.zipador_prefs.json
# A troca de idioma é instantânea (sem reiniciar), atualiza todos os widgets.
# Cada idioma contém exatamente as mesmas chaves no dicionário TRADUCOES.

_IDIOMA_PADRAO = "pt-br"
"""str: Idioma padrão quando nenhuma preferência foi salva."""

_IDIOMAS_DISPONIVEIS = ["pt-br", "en", "es"]
"""list: Códigos de idioma suportados."""

TRADUCOES = {
    "pt-br": {
        "titulo_app": "Zipador de Alta Performance",
        "subtitulo": "Compactar e Descompactar ZIP \u2014 sem limites de caminho",
        "aba_compactar": "  \U0001f4e6  Compactar  ",
        "aba_descompactar": "  \U0001f4c2  Descompactar  ",
        "aba_sobre": "  \u2139\ufe0f  Sobre  ",
        "o_que_compactar": "\U0001f4c1  O que compactar?",
        "btn_pasta": "Pasta...",
        "btn_arquivo": "Arquivo...",
        "dica_origem": "Selecione a pasta/arquivo ou cole o caminho",
        "configuracoes": "\u2699\ufe0f  Configura\u00e7\u00f5es",
        "nivel_compressao": "N\u00edvel de compress\u00e3o",
        "nivel_dica": "0 = r\u00e1pido  |  9 = m\u00e1ximo",
        "threads": "Threads paralelas",
        "pronto_compactar": "Pronto para compactar",
        "btn_compactar": "\U0001f5dc  Compactar em ZIP",
        "btn_cancelar": "Cancelar",
        "zip_para_descompactar": "\U0001f4e6  Arquivo ZIP para descompactar",
        "btn_selecionar_zip": "Selecionar ZIP...",
        "dica_zip": "Selecione o arquivo .zip ou cole o caminho",
        "pronto_descompactar": "Pronto para descompactar",
        "btn_descompactar": "\U0001f4c2  Descompactar",
        "dlg_sel_pasta": "Selecionar pasta para compactar",
        "dlg_sel_arq": "Selecionar arquivo para compactar",
        "dlg_sel_zip": "Selecionar arquivo ZIP",
        "dlg_onde_salvar": "Onde salvar o arquivo ZIP?",
        "dlg_onde_extrair": "Onde extrair os arquivos?",
        "aviso": "Aten\u00e7\u00e3o",
        "erro": "Erro",
        "sel_pasta_primeiro": "Selecione uma pasta ou arquivo primeiro!",
        "caminho_nao_encontrado": "Caminho n\u00e3o encontrado:\n{cam}",
        "sel_zip_primeiro": "Selecione um arquivo ZIP primeiro!",
        "arq_nao_encontrado": "Arquivo n\u00e3o encontrado:\n{arq}",
        "status_progresso": "{pct}%  \u2022  {feitos}/{total_arq} arquivos  \u2022  {feitos_tam} / {total_tam}",
        "cancelado": "Cancelado pelo usu\u00e1rio",
        "cancelando": "Cancelando...",
        "iniciando_compactacao": "Iniciando compacta\u00e7\u00e3o...",
        "iniciando_descompactacao": "Iniciando descompacta\u00e7\u00e3o...",
        "status_zip_ok": "\u2705 Conclu\u00eddo!  {total} \u2192 {zsize}  ({taxa}%)  em {tempo}",
        "status_unzip_ok": "\u2705 Conclu\u00eddo!  {arquivos} arquivos extra\u00eddos em {tempo}",
        "erro_compactacao": "Erro na compacta\u00e7\u00e3o",
        "erro_descompactacao": "Erro na descompacta\u00e7\u00e3o",
        "compactacao_concluida": "Compacta\u00e7\u00e3o Conclu\u00edda!",
        "dlg_zip_ok": "ZIP criado com sucesso!\n\n\U0001f4e6 {destino}\n\nOriginal: {total}\nZIP: {zsize} ({taxa}%)\nTempo: {tempo}",
        "descompactacao_concluida": "Descompacta\u00e7\u00e3o Conclu\u00edda!",
        "dlg_unzip_ok": "Arquivos extra\u00eddos com sucesso!\n\n\U0001f4c2 {destino}\n\nArquivos: {arquivos}\nTamanho: {total}\nTempo: {tempo}",
        "versao": "Vers\u00e3o",
        "desenvolvedor": "\U0001f468\u200d\U0001f4bb Desenvolvedor",
        "licenca_protecao": "\U0001f512 Licen\u00e7a e Prote\u00e7\u00e3o",
        "licenca_label": "Licen\u00e7a",
        "aviso_legal": "\u2696\ufe0f Aviso Legal",
        "aviso_legal_texto": (
            "Este software \u00e9 propriedade exclusiva de "
            "{autor}. \u00c9 PROIBIDO copiar, modificar, "
            "redistribuir, descompilar ou fazer engenharia reversa "
            "sem autoriza\u00e7\u00e3o pr\u00e9via e por escrito do autor.\n\n"
            "Protegido pela Lei n\u00ba 9.609/98 (Lei do Software) e "
            "Lei n\u00ba 9.610/98 (Lei de Direitos Autorais) do Brasil, "
            "al\u00e9m de tratados internacionais de propriedade intelectual.\n\n"
            "Viola\u00e7\u00f5es est\u00e3o sujeitas a responsabilidade civil e criminal."
        ),
        "rodape": "\u00a9 2026 {autor}  \u2022  {publisher}  \u2022  Todos os direitos reservados",
        "arquivo_zip_filtro": "Arquivo ZIP",
        "todos_filtro": "Todos",
        "aviso_caminhos_longos_titulo": "\u26a0\ufe0f Aviso: Caminhos Longos",
        "aviso_caminhos_longos": (
            "Este ZIP cont\u00e9m {qty} arquivo(s) com caminhos maiores que 260 caracteres "
            "(maior: {max} chars).\n\n"
            "O Windows Explorer N\u00c3O consegue abrir este ZIP corretamente.\n\n"
            "\U0001f449 Use o Zipador para descompactar este arquivo."
        ),
        "modo_turbo": "\u26a1 Modo Turbo",
        "turbo_dica": "Compressão mínima + máximo de threads = velocidade extrema",
        "turbo_dica_unzip": "Máximo de threads para extração ultrarrápida",
    },
    "en": {
        "titulo_app": "High Performance Zipper",
        "subtitulo": "Compress and Decompress ZIP \u2014 no path limits",
        "aba_compactar": "  \U0001f4e6  Compress  ",
        "aba_descompactar": "  \U0001f4c2  Decompress  ",
        "aba_sobre": "  \u2139\ufe0f  About  ",
        "o_que_compactar": "\U0001f4c1  What to compress?",
        "btn_pasta": "Folder...",
        "btn_arquivo": "File...",
        "dica_origem": "Select a folder/file or paste the path",
        "configuracoes": "\u2699\ufe0f  Settings",
        "nivel_compressao": "Compression level",
        "nivel_dica": "0 = fast  |  9 = maximum",
        "threads": "Parallel threads",
        "pronto_compactar": "Ready to compress",
        "btn_compactar": "\U0001f5dc  Compress to ZIP",
        "btn_cancelar": "Cancel",
        "zip_para_descompactar": "\U0001f4e6  ZIP file to decompress",
        "btn_selecionar_zip": "Select ZIP...",
        "dica_zip": "Select the .zip file or paste the path",
        "pronto_descompactar": "Ready to decompress",
        "btn_descompactar": "\U0001f4c2  Decompress",
        "dlg_sel_pasta": "Select folder to compress",
        "dlg_sel_arq": "Select file to compress",
        "dlg_sel_zip": "Select ZIP file",
        "dlg_onde_salvar": "Where to save the ZIP file?",
        "dlg_onde_extrair": "Where to extract the files?",
        "aviso": "Warning",
        "erro": "Error",
        "sel_pasta_primeiro": "Select a folder or file first!",
        "caminho_nao_encontrado": "Path not found:\n{cam}",
        "sel_zip_primeiro": "Select a ZIP file first!",
        "arq_nao_encontrado": "File not found:\n{arq}",
        "status_progresso": "{pct}%  \u2022  {feitos}/{total_arq} files  \u2022  {feitos_tam} / {total_tam}",
        "cancelado": "Cancelled by user",
        "cancelando": "Cancelling...",
        "iniciando_compactacao": "Starting compression...",
        "iniciando_descompactacao": "Starting decompression...",
        "status_zip_ok": "\u2705 Done!  {total} \u2192 {zsize}  ({taxa}%)  in {tempo}",
        "status_unzip_ok": "\u2705 Done!  {arquivos} files extracted in {tempo}",
        "erro_compactacao": "Compression error",
        "erro_descompactacao": "Decompression error",
        "compactacao_concluida": "Compression Complete!",
        "dlg_zip_ok": "ZIP created successfully!\n\n\U0001f4e6 {destino}\n\nOriginal: {total}\nZIP: {zsize} ({taxa}%)\nTime: {tempo}",
        "descompactacao_concluida": "Decompression Complete!",
        "dlg_unzip_ok": "Files extracted successfully!\n\n\U0001f4c2 {destino}\n\nFiles: {arquivos}\nSize: {total}\nTime: {tempo}",
        "versao": "Version",
        "desenvolvedor": "\U0001f468\u200d\U0001f4bb Developer",
        "licenca_protecao": "\U0001f512 License & Protection",
        "licenca_label": "License",
        "aviso_legal": "\u2696\ufe0f Legal Notice",
        "aviso_legal_texto": (
            "This software is the exclusive property of "
            "{autor}. It is PROHIBITED to copy, modify, "
            "redistribute, decompile or reverse engineer "
            "without prior written authorization from the author.\n\n"
            "Protected under Brazilian Law No. 9,609/98 (Software Law) and "
            "Law No. 9,610/98 (Copyright Law), "
            "as well as international intellectual property treaties.\n\n"
            "Violations are subject to civil and criminal liability."
        ),
        "rodape": "\u00a9 2026 {autor}  \u2022  {publisher}  \u2022  All rights reserved",
        "arquivo_zip_filtro": "ZIP File",
        "todos_filtro": "All",
        "aviso_caminhos_longos_titulo": "\u26a0\ufe0f Warning: Long Paths",
        "aviso_caminhos_longos": (
            "This ZIP contains {qty} file(s) with paths longer than 260 characters "
            "(longest: {max} chars).\n\n"
            "Windows Explorer CANNOT open this ZIP correctly.\n\n"
            "\U0001f449 Use Zipador to decompress this file."
        ),
        "modo_turbo": "\u26a1 Turbo Mode",
        "turbo_dica": "Minimal compression + max threads = extreme speed",
        "turbo_dica_unzip": "Max threads for ultra-fast extraction",
    },
    "es": {
        "titulo_app": "Zipador de Alto Rendimiento",
        "subtitulo": "Comprimir y Descomprimir ZIP \u2014 sin l\u00edmite de ruta",
        "aba_compactar": "  \U0001f4e6  Comprimir  ",
        "aba_descompactar": "  \U0001f4c2  Descomprimir  ",
        "aba_sobre": "  \u2139\ufe0f  Acerca de  ",
        "o_que_compactar": "\U0001f4c1  \u00bfQu\u00e9 comprimir?",
        "btn_pasta": "Carpeta...",
        "btn_arquivo": "Archivo...",
        "dica_origem": "Seleccione la carpeta/archivo o pegue la ruta",
        "configuracoes": "\u2699\ufe0f  Configuraci\u00f3n",
        "nivel_compressao": "Nivel de compresi\u00f3n",
        "nivel_dica": "0 = r\u00e1pido  |  9 = m\u00e1ximo",
        "threads": "Hilos paralelos",
        "pronto_compactar": "Listo para comprimir",
        "btn_compactar": "\U0001f5dc  Comprimir en ZIP",
        "btn_cancelar": "Cancelar",
        "zip_para_descompactar": "\U0001f4e6  Archivo ZIP para descomprimir",
        "btn_selecionar_zip": "Seleccionar ZIP...",
        "dica_zip": "Seleccione el archivo .zip o pegue la ruta",
        "pronto_descompactar": "Listo para descomprimir",
        "btn_descompactar": "\U0001f4c2  Descomprimir",
        "dlg_sel_pasta": "Seleccionar carpeta para comprimir",
        "dlg_sel_arq": "Seleccionar archivo para comprimir",
        "dlg_sel_zip": "Seleccionar archivo ZIP",
        "dlg_onde_salvar": "\u00bfD\u00f3nde guardar el archivo ZIP?",
        "dlg_onde_extrair": "\u00bfD\u00f3nde extraer los archivos?",
        "aviso": "Atenci\u00f3n",
        "erro": "Error",
        "sel_pasta_primeiro": "\u00a1Seleccione una carpeta o archivo primero!",
        "caminho_nao_encontrado": "Ruta no encontrada:\n{cam}",
        "sel_zip_primeiro": "\u00a1Seleccione un archivo ZIP primero!",
        "arq_nao_encontrado": "Archivo no encontrado:\n{arq}",
        "status_progresso": "{pct}%  \u2022  {feitos}/{total_arq} archivos  \u2022  {feitos_tam} / {total_tam}",
        "cancelado": "Cancelado por el usuario",
        "cancelando": "Cancelando...",
        "iniciando_compactacao": "Iniciando compresi\u00f3n...",
        "iniciando_descompactacao": "Iniciando descompresi\u00f3n...",
        "status_zip_ok": "\u2705 \u00a1Completado!  {total} \u2192 {zsize}  ({taxa}%)  en {tempo}",
        "status_unzip_ok": "\u2705 \u00a1Completado!  {arquivos} archivos extra\u00eddos en {tempo}",
        "erro_compactacao": "Error en la compresi\u00f3n",
        "erro_descompactacao": "Error en la descompresi\u00f3n",
        "compactacao_concluida": "\u00a1Compresi\u00f3n Completada!",
        "dlg_zip_ok": "\u00a1ZIP creado con \u00e9xito!\n\n\U0001f4e6 {destino}\n\nOriginal: {total}\nZIP: {zsize} ({taxa}%)\nTiempo: {tempo}",
        "descompactacao_concluida": "\u00a1Descompresi\u00f3n Completada!",
        "dlg_unzip_ok": "\u00a1Archivos extra\u00eddos con \u00e9xito!\n\n\U0001f4c2 {destino}\n\nArchivos: {arquivos}\nTama\u00f1o: {total}\nTiempo: {tempo}",
        "versao": "Versi\u00f3n",
        "desenvolvedor": "\U0001f468\u200d\U0001f4bb Desarrollador",
        "licenca_protecao": "\U0001f512 Licencia y Protecci\u00f3n",
        "licenca_label": "Licencia",
        "aviso_legal": "\u2696\ufe0f Aviso Legal",
        "aviso_legal_texto": (
            "Este software es propiedad exclusiva de "
            "{autor}. Est\u00e1 PROHIBIDO copiar, modificar, "
            "redistribuir, descompilar o realizar ingenier\u00eda inversa "
            "sin autorizaci\u00f3n previa y por escrito del autor.\n\n"
            "Protegido por la Ley brasile\u00f1a N\u00ba 9.609/98 (Ley de Software) y "
            "Ley N\u00ba 9.610/98 (Ley de Derechos de Autor), "
            "adem\u00e1s de tratados internacionales de propiedad intelectual.\n\n"
            "Las violaciones est\u00e1n sujetas a responsabilidad civil y penal."
        ),
        "rodape": "\u00a9 2026 {autor}  \u2022  {publisher}  \u2022  Todos los derechos reservados",
        "arquivo_zip_filtro": "Archivo ZIP",
        "todos_filtro": "Todos",
        "aviso_caminhos_longos_titulo": "\u26a0\ufe0f Aviso: Rutas Largas",
        "aviso_caminhos_longos": (
            "Este ZIP contiene {qty} archivo(s) con rutas mayores a 260 caracteres "
            "(mayor: {max} chars).\n\n"
            "El Explorador de Windows NO puede abrir este ZIP correctamente.\n\n"
            "\U0001f449 Use Zipador para descomprimir este archivo."
        ),
        "modo_turbo": "\u26a1 Modo Turbo",
        "turbo_dica": "Compresión mínima + máximo de hilos = velocidad extrema",
        "turbo_dica_unzip": "Máximo de hilos para extracción ultrarrápida",
    },
}


def _caminho_prefs():
    """Retorna caminho do arquivo de preferências."""
    if os.name == 'nt':
        base = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
    else:
        base = os.path.expanduser('~')
    return os.path.join(base, 'PiquetSoftware', 'Zipador', '.zipador_prefs.json')


def _carregar_idioma_salvo():
    """Carrega idioma salvo das preferências."""
    try:
        with open(_caminho_prefs(), 'r', encoding='utf-8') as f:
            prefs = json.load(f)
            lang = prefs.get('idioma', _IDIOMA_PADRAO)
            if lang in _IDIOMAS_DISPONIVEIS:
                return lang
    except Exception:
        pass
    return _IDIOMA_PADRAO


def _salvar_idioma(lang):
    """Salva preferência de idioma."""
    try:
        caminho = _caminho_prefs()
        os.makedirs(os.path.dirname(caminho), exist_ok=True)
        with open(caminho, 'w', encoding='utf-8') as f:
            json.dump({"idioma": lang}, f)
    except Exception:
        pass


# ============================================================
# INTERFACE GRÁFICA
# ============================================================
def iniciar_gui():
    """Ponto de entrada da interface gráfica.

    Fluxo de inicialização:
    1. Verificação de proteção (HWID + integridade do exe)
    2. Carregamento do idioma salvo nas preferências
    3. Construção da janela principal (750×750, centralizada)
    4. Configuração de estilos ttk (tema clam customizado)
    5. Montagem das 3 abas: Compactar, Descompactar, Sobre
    6. Bind das bandeiras de idioma + mainloop

    A lógica de compactação/descompactação roda em threads daemon
    para não bloquear a GUI. Callbacks usam ``janela.after()``
    para atualizar widgets de forma thread-safe.
    """
    # ================================================================
    # VERIFICAÇÃO DE PROTEÇÃO NA INICIALIZAÇÃO
    # ================================================================
    root_check = tk.Tk()
    root_check.withdraw()
    if not ProtecaoSoftware.verificar_protecao():
        root_check.destroy()
        sys.exit(1)
    root_check.destroy()

    # ================================================================
    # SISTEMA DE IDIOMAS
    # ================================================================
    idioma = [_carregar_idioma_salvo()]
    z_ativo = [False]
    u_ativo = [False]

    def t(chave):
        """Retorna texto traduzido para o idioma atual."""
        return TRADUCOES[idioma[0]].get(chave, chave)

    # ================================================================
    # JANELA PRINCIPAL
    # ================================================================
    janela = tk.Tk()
    janela.title(f"\u26a1 {t('titulo_app')} v{__version__}  \u2014  \u00a9 {__author__}")
    janela.configure(bg=BG)
    janela.resizable(True, True)

    larg, alt = 750, 750
    x = (janela.winfo_screenwidth() - larg) // 2
    y = (janela.winfo_screenheight() - alt) // 2
    janela.geometry(f"{larg}x{alt}+{x}+{y}")
    janela.minsize(650, 650)

    # ---- Estilos ----
    sty = ttk.Style()
    sty.theme_use('clam')
    sty.configure("TFrame", background=BG)
    sty.configure("TNotebook", background=BG, borderwidth=0)
    sty.configure("TNotebook.Tab", background=BG3, foreground=FG,
                  font=("Segoe UI", 11, "bold"), padding=(20, 10))
    sty.map("TNotebook.Tab",
            background=[("selected", ACCENT)],
            foreground=[("selected", "white")])

    sty.configure("Zip.TButton",
                  background=ACCENT, foreground="white",
                  font=("Segoe UI", 12, "bold"), padding=(20, 12), borderwidth=0)
    sty.map("Zip.TButton",
            background=[("active", ACC_HOV), ("disabled", BG3)])

    sty.configure("Unzip.TButton",
                  background=GREEN, foreground="white",
                  font=("Segoe UI", 12, "bold"), padding=(20, 12), borderwidth=0)
    sty.map("Unzip.TButton",
            background=[("active", GREEN_H), ("disabled", BG3)])

    sty.configure("Browse.TButton",
                  background=BG3, foreground=FG,
                  font=("Segoe UI", 10), padding=(14, 8), borderwidth=0)
    sty.map("Browse.TButton", background=[("active", BORDER)])

    sty.configure("Cancel.TButton",
                  background=RED, foreground="white",
                  font=("Segoe UI", 10, "bold"), padding=(14, 8), borderwidth=0)
    sty.map("Cancel.TButton", background=[("active", RED_H)])

    sty.configure("Custom.Horizontal.TProgressbar",
                  troughcolor=PROG_BG, background=ACCENT, borderwidth=0, thickness=22)
    sty.configure("Green.Horizontal.TProgressbar",
                  troughcolor=PROG_BG, background=GREEN, borderwidth=0, thickness=22)

    # ---- Título + Bandeiras ----
    frame_titulo = tk.Frame(janela, bg=BG)
    frame_titulo.pack(fill=tk.X, padx=24, pady=(16, 0))

    lbl_titulo = tk.Label(frame_titulo, text=f"\u26a1 {t('titulo_app')}",
                          bg=BG, fg=FG, font=("Segoe UI", 18, "bold"))
    lbl_titulo.pack(side=tk.LEFT, anchor="w")

    # ---- Bandeiras / Language Flags ----
    frame_bandeiras = tk.Frame(frame_titulo, bg=BG)
    frame_bandeiras.pack(side=tk.RIGHT, anchor="e", pady=(4, 0))

    bandeiras = {}

    # Brasil
    c_br = tk.Canvas(frame_bandeiras, width=32, height=22, bg="#009c3b",
                     highlightthickness=2, highlightbackground=ACCENT, cursor="hand2")
    c_br.create_polygon(16, 2, 30, 11, 16, 20, 2, 11, fill="#ffdf00", outline="")
    c_br.create_oval(10, 6, 22, 16, fill="#002776", outline="")
    c_br.pack(side=tk.LEFT, padx=(0, 4))
    bandeiras["pt-br"] = c_br

    # EUA (English)
    c_en = tk.Canvas(frame_bandeiras, width=32, height=22, bg="white",
                     highlightthickness=1, highlightbackground=BORDER, cursor="hand2")
    for i in range(13):
        cor = "#b22234" if i % 2 == 0 else "white"
        y0 = i * 22 // 13
        y1 = (i + 1) * 22 // 13
        c_en.create_rectangle(0, y0, 32, y1, fill=cor, outline="")
    c_en.create_rectangle(0, 0, 13, 12, fill="#3c3b6e", outline="")
    c_en.pack(side=tk.LEFT, padx=(0, 4))
    bandeiras["en"] = c_en

    # España
    c_es = tk.Canvas(frame_bandeiras, width=32, height=22, bg="#ffc400",
                     highlightthickness=1, highlightbackground=BORDER, cursor="hand2")
    c_es.create_rectangle(0, 0, 32, 6, fill="#c60b1e", outline="")
    c_es.create_rectangle(0, 6, 32, 16, fill="#ffc400", outline="")
    c_es.create_rectangle(0, 16, 32, 22, fill="#c60b1e", outline="")
    c_es.pack(side=tk.LEFT)
    bandeiras["es"] = c_es

    # Subtitle row
    frame_sub = tk.Frame(janela, bg=BG)
    frame_sub.pack(fill=tk.X, padx=24)

    lbl_subtitulo = tk.Label(frame_sub,
                             text=f"{t('subtitulo')}  |  v{__version__}",
                             bg=BG, fg=FG2, font=("Segoe UI", 9))
    lbl_subtitulo.pack(side=tk.LEFT, anchor="w", pady=(0, 8))

    lbl_copyright_bar = tk.Label(frame_sub, text=f"\u00a9 {__author__}",
                                 bg=BG, fg=ACCENT, font=("Segoe UI", 8, "italic"))
    lbl_copyright_bar.pack(side=tk.RIGHT, anchor="e", pady=(0, 8))

    # ---- Notebook (Abas) ----
    notebook = ttk.Notebook(janela)
    notebook.pack(fill=tk.BOTH, expand=True, padx=24, pady=(0, 16))

    # ==========================================================
    # ABA 1: COMPACTAR
    # ==========================================================
    aba_zip = tk.Frame(notebook, bg=BG)
    notebook.add(aba_zip, text=t("aba_compactar"))

    ref_zip = [None]
    var_zip_origem = tk.StringVar()
    var_zip_nivel = tk.IntVar(value=6)
    var_zip_threads = tk.IntVar(value=MAX_THREADS_PADRAO)

    # Card: Selecionar origem
    c1 = tk.Frame(aba_zip, bg=BG2, highlightbackground=BORDER, highlightthickness=1)
    c1.pack(fill=tk.X, padx=16, pady=(16, 8))
    c1i = tk.Frame(c1, bg=BG2)
    c1i.pack(fill=tk.X, padx=16, pady=12)

    lbl_o_que = tk.Label(c1i, text=t("o_que_compactar"),
                         bg=BG2, fg=FG, font=("Segoe UI", 11, "bold"))
    lbl_o_que.pack(anchor="w")

    f_inp_z = tk.Frame(c1i, bg=BG2)
    f_inp_z.pack(fill=tk.X, pady=(6, 0))

    ent_zip_orig = tk.Entry(f_inp_z, textvariable=var_zip_origem, font=("Consolas", 11),
                            bg=INPUT_BG, fg=FG, insertbackground=FG, relief="flat", bd=0,
                            highlightbackground=BORDER, highlightthickness=1,
                            highlightcolor=ACCENT)
    ent_zip_orig.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=(0, 6))

    def z_sel_pasta():
        """Abre diálogo para selecionar pasta a compactar."""
        p = filedialog.askdirectory(title=t("dlg_sel_pasta"))
        if p:
            var_zip_origem.set(p)

    def z_sel_arq():
        """Abre diálogo para selecionar arquivo a compactar."""
        f = filedialog.askopenfilename(title=t("dlg_sel_arq"))
        if f:
            var_zip_origem.set(f)

    btn_z_pasta = ttk.Button(f_inp_z, text=t("btn_pasta"), style="Browse.TButton", command=z_sel_pasta)
    btn_z_pasta.pack(side=tk.LEFT, padx=(0, 4))
    btn_z_arq = ttk.Button(f_inp_z, text=t("btn_arquivo"), style="Browse.TButton", command=z_sel_arq)
    btn_z_arq.pack(side=tk.LEFT)

    lbl_dica_orig = tk.Label(c1i, text=t("dica_origem"),
                             bg=BG2, fg=FG2, font=("Segoe UI", 8))
    lbl_dica_orig.pack(anchor="w", pady=(4, 0))

    # Card: Config
    c2 = tk.Frame(aba_zip, bg=BG2, highlightbackground=BORDER, highlightthickness=1)
    c2.pack(fill=tk.X, padx=16, pady=(0, 8))
    c2i = tk.Frame(c2, bg=BG2)
    c2i.pack(fill=tk.X, padx=16, pady=12)

    lbl_config_z = tk.Label(c2i, text=t("configuracoes"),
                            bg=BG2, fg=FG, font=("Segoe UI", 11, "bold"))
    lbl_config_z.pack(anchor="w")

    f_sl = tk.Frame(c2i, bg=BG2)
    f_sl.pack(fill=tk.X, pady=(6, 0))

    fn = tk.Frame(f_sl, bg=BG2)
    fn.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 16))
    lbl_nivel = tk.Label(fn, text=t("nivel_compressao"), bg=BG2, fg=FG2, font=("Segoe UI", 9))
    lbl_nivel.pack(anchor="w")
    tk.Scale(fn, from_=0, to=9, orient=tk.HORIZONTAL, variable=var_zip_nivel,
             bg=BG2, fg=FG, troughcolor=BG3, highlightbackground=BG2,
             activebackground=ACCENT, sliderrelief="flat", bd=0,
             length=200, font=("Segoe UI", 9)).pack(fill=tk.X)
    lbl_nivel_dica = tk.Label(fn, text=t("nivel_dica"), bg=BG2, fg=FG2, font=("Segoe UI", 8))
    lbl_nivel_dica.pack(anchor="w")

    ft = tk.Frame(f_sl, bg=BG2)
    ft.pack(side=tk.LEFT, fill=tk.X, expand=True)
    lbl_threads_z = tk.Label(ft, text=t("threads"), bg=BG2, fg=FG2, font=("Segoe UI", 9))
    lbl_threads_z.pack(anchor="w")
    tk.Scale(ft, from_=1, to=max(MAX_THREADS_PADRAO * 2, 16),
             orient=tk.HORIZONTAL, variable=var_zip_threads,
             bg=BG2, fg=FG, troughcolor=BG3, highlightbackground=BG2,
             activebackground=ACCENT, sliderrelief="flat", bd=0,
             length=200, font=("Segoe UI", 9)).pack(fill=tk.X)
    tk.Label(ft, text=f"CPUs: {MAX_THREADS_PADRAO}", bg=BG2, fg=FG2, font=("Segoe UI", 8)).pack(anchor="w")

    # Modo Turbo - compactar
    var_turbo_zip = tk.BooleanVar(value=False)

    f_turbo_z = tk.Frame(c2i, bg=BG2)
    f_turbo_z.pack(fill=tk.X, pady=(10, 0))
    chk_turbo_z = tk.Checkbutton(
        f_turbo_z, text=t("modo_turbo"), variable=var_turbo_zip,
        bg=BG2, fg=ORANGE, selectcolor=BG3, activebackground=BG2,
        activeforeground=ORANGE, font=("Segoe UI", 11, "bold"),
        cursor="hand2", bd=0, highlightthickness=0
    )
    chk_turbo_z.pack(side=tk.LEFT)
    lbl_turbo_z_dica = tk.Label(f_turbo_z, text=t("turbo_dica"),
                                bg=BG2, fg=FG2, font=("Segoe UI", 8))
    lbl_turbo_z_dica.pack(side=tk.LEFT, padx=(8, 0))

    # Progresso ZIP
    f_pz = tk.Frame(aba_zip, bg=BG)
    f_pz.pack(fill=tk.X, padx=16, pady=(0, 4))
    barra_zip = ttk.Progressbar(f_pz, style="Custom.Horizontal.TProgressbar",
                                mode="determinate", maximum=100)
    barra_zip.pack(fill=tk.X, ipady=2)
    lbl_z_status = tk.Label(f_pz, text=t("pronto_compactar"), bg=BG, fg=FG2,
                            font=("Segoe UI", 9), anchor="w")
    lbl_z_status.pack(fill=tk.X, pady=(4, 0))

    # Log ZIP
    f_lz = tk.Frame(aba_zip, bg=BG)
    f_lz.pack(fill=tk.BOTH, expand=True, padx=16, pady=(0, 8))
    txt_z_log = tk.Text(f_lz, height=6, bg=INPUT_BG, fg=FG2, font=("Consolas", 9),
                        relief="flat", bd=0, highlightbackground=BORDER,
                        highlightthickness=1, insertbackground=FG,
                        wrap=tk.WORD, state=tk.DISABLED)
    txt_z_log.pack(fill=tk.BOTH, expand=True)
    sb_z = ttk.Scrollbar(txt_z_log, orient=tk.VERTICAL, command=txt_z_log.yview)
    txt_z_log.configure(yscrollcommand=sb_z.set)
    sb_z.pack(side=tk.RIGHT, fill=tk.Y)

    # Botões ZIP
    f_bz = tk.Frame(aba_zip, bg=BG)
    f_bz.pack(fill=tk.X, padx=16, pady=(0, 12))
    btn_z_cancelar = ttk.Button(f_bz, text=t("btn_cancelar"), style="Cancel.TButton", state=tk.DISABLED)
    btn_z_cancelar.pack(side=tk.RIGHT, padx=(8, 0))
    btn_z_go = ttk.Button(f_bz, text=t("btn_compactar"), style="Zip.TButton")
    btn_z_go.pack(side=tk.RIGHT)

    # ==========================================================
    # ABA 2: DESCOMPACTAR
    # ==========================================================
    aba_unzip = tk.Frame(notebook, bg=BG)
    notebook.add(aba_unzip, text=t("aba_descompactar"))

    ref_unzip = [None]
    var_unzip_arquivo = tk.StringVar()
    var_unzip_threads = tk.IntVar(value=MAX_THREADS_PADRAO)

    # Card: Selecionar ZIP
    d1 = tk.Frame(aba_unzip, bg=BG2, highlightbackground=BORDER, highlightthickness=1)
    d1.pack(fill=tk.X, padx=16, pady=(16, 8))
    d1i = tk.Frame(d1, bg=BG2)
    d1i.pack(fill=tk.X, padx=16, pady=12)

    lbl_zip_para = tk.Label(d1i, text=t("zip_para_descompactar"),
                            bg=BG2, fg=FG, font=("Segoe UI", 11, "bold"))
    lbl_zip_para.pack(anchor="w")

    f_inp_u = tk.Frame(d1i, bg=BG2)
    f_inp_u.pack(fill=tk.X, pady=(6, 0))

    ent_unzip = tk.Entry(f_inp_u, textvariable=var_unzip_arquivo, font=("Consolas", 11),
                         bg=INPUT_BG, fg=FG, insertbackground=FG, relief="flat", bd=0,
                         highlightbackground=BORDER, highlightthickness=1,
                         highlightcolor=ACCENT)
    ent_unzip.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=8, padx=(0, 6))

    def u_sel_zip():
        """Abre diálogo para selecionar arquivo ZIP a descompactar."""
        f = filedialog.askopenfilename(
            title=t("dlg_sel_zip"),
            filetypes=[(t("arquivo_zip_filtro"), "*.zip"), (t("todos_filtro"), "*.*")]
        )
        if f:
            var_unzip_arquivo.set(f)

    btn_u_zip = ttk.Button(f_inp_u, text=t("btn_selecionar_zip"), style="Browse.TButton", command=u_sel_zip)
    btn_u_zip.pack(side=tk.LEFT)

    lbl_dica_zip = tk.Label(d1i, text=t("dica_zip"),
                            bg=BG2, fg=FG2, font=("Segoe UI", 8))
    lbl_dica_zip.pack(anchor="w", pady=(4, 0))

    # Card: Config descompactar
    d2 = tk.Frame(aba_unzip, bg=BG2, highlightbackground=BORDER, highlightthickness=1)
    d2.pack(fill=tk.X, padx=16, pady=(0, 8))
    d2i = tk.Frame(d2, bg=BG2)
    d2i.pack(fill=tk.X, padx=16, pady=12)

    lbl_config_u = tk.Label(d2i, text=t("configuracoes"),
                            bg=BG2, fg=FG, font=("Segoe UI", 11, "bold"))
    lbl_config_u.pack(anchor="w")

    f_ut = tk.Frame(d2i, bg=BG2)
    f_ut.pack(fill=tk.X, pady=(6, 0))
    lbl_threads_u = tk.Label(f_ut, text=t("threads"), bg=BG2, fg=FG2, font=("Segoe UI", 9))
    lbl_threads_u.pack(anchor="w")
    tk.Scale(f_ut, from_=1, to=max(MAX_THREADS_PADRAO * 2, 16),
             orient=tk.HORIZONTAL, variable=var_unzip_threads,
             bg=BG2, fg=FG, troughcolor=BG3, highlightbackground=BG2,
             activebackground=GREEN, sliderrelief="flat", bd=0,
             length=300, font=("Segoe UI", 9)).pack(fill=tk.X)
    tk.Label(f_ut, text=f"CPUs: {MAX_THREADS_PADRAO}",
             bg=BG2, fg=FG2, font=("Segoe UI", 8)).pack(anchor="w")

    # Modo Turbo - descompactar
    var_turbo_unzip = tk.BooleanVar(value=False)

    f_turbo_u = tk.Frame(d2i, bg=BG2)
    f_turbo_u.pack(fill=tk.X, pady=(10, 0))
    chk_turbo_u = tk.Checkbutton(
        f_turbo_u, text=t("modo_turbo"), variable=var_turbo_unzip,
        bg=BG2, fg=ORANGE, selectcolor=BG3, activebackground=BG2,
        activeforeground=ORANGE, font=("Segoe UI", 11, "bold"),
        cursor="hand2", bd=0, highlightthickness=0
    )
    chk_turbo_u.pack(side=tk.LEFT)
    lbl_turbo_u_dica = tk.Label(f_turbo_u, text=t("turbo_dica_unzip"),
                                bg=BG2, fg=FG2, font=("Segoe UI", 8))
    lbl_turbo_u_dica.pack(side=tk.LEFT, padx=(8, 0))

    # Progresso descompactar
    f_pu = tk.Frame(aba_unzip, bg=BG)
    f_pu.pack(fill=tk.X, padx=16, pady=(0, 4))
    barra_unzip = ttk.Progressbar(f_pu, style="Green.Horizontal.TProgressbar",
                                  mode="determinate", maximum=100)
    barra_unzip.pack(fill=tk.X, ipady=2)
    lbl_u_status = tk.Label(f_pu, text=t("pronto_descompactar"), bg=BG, fg=FG2,
                            font=("Segoe UI", 9), anchor="w")
    lbl_u_status.pack(fill=tk.X, pady=(4, 0))

    # Log descompactar
    f_lu = tk.Frame(aba_unzip, bg=BG)
    f_lu.pack(fill=tk.BOTH, expand=True, padx=16, pady=(0, 8))
    txt_u_log = tk.Text(f_lu, height=6, bg=INPUT_BG, fg=FG2, font=("Consolas", 9),
                        relief="flat", bd=0, highlightbackground=BORDER,
                        highlightthickness=1, insertbackground=FG,
                        wrap=tk.WORD, state=tk.DISABLED)
    txt_u_log.pack(fill=tk.BOTH, expand=True)
    sb_u = ttk.Scrollbar(txt_u_log, orient=tk.VERTICAL, command=txt_u_log.yview)
    txt_u_log.configure(yscrollcommand=sb_u.set)
    sb_u.pack(side=tk.RIGHT, fill=tk.Y)

    # Botões descompactar
    f_bu = tk.Frame(aba_unzip, bg=BG)
    f_bu.pack(fill=tk.X, padx=16, pady=(0, 12))
    btn_u_cancelar = ttk.Button(f_bu, text=t("btn_cancelar"), style="Cancel.TButton", state=tk.DISABLED)
    btn_u_cancelar.pack(side=tk.RIGHT, padx=(8, 0))
    btn_u_go = ttk.Button(f_bu, text=t("btn_descompactar"), style="Unzip.TButton")
    btn_u_go.pack(side=tk.RIGHT)

    # ==========================================================
    # ABA 3: SOBRE / LICENÇA (reconstruída ao trocar idioma)
    # ==========================================================
    aba_sobre = tk.Frame(notebook, bg=BG)
    notebook.add(aba_sobre, text=t("aba_sobre"))

    sobre_container = tk.Frame(aba_sobre, bg=BG)
    sobre_container.pack(fill=tk.BOTH, expand=True, padx=24, pady=16)

    def construir_sobre():
        """Constrói/reconstrói o conteúdo da aba Sobre."""
        for w in sobre_container.winfo_children():
            w.destroy()

        # Logo / Título
        tk.Label(sobre_container, text=f"\u26a1 {t('titulo_app')}",
                 bg=BG, fg=ACCENT, font=("Segoe UI", 22, "bold")).pack(pady=(16, 4))
        tk.Label(sobre_container, text=f"{t('versao')} {__version__}",
                 bg=BG, fg=FG, font=("Segoe UI", 12)).pack(pady=(0, 16))

        # Card: Desenvolvedor
        card_dev = tk.Frame(sobre_container, bg=BG2, highlightbackground=ACCENT, highlightthickness=2)
        card_dev.pack(fill=tk.X, pady=(0, 12))
        card_dev_i = tk.Frame(card_dev, bg=BG2)
        card_dev_i.pack(fill=tk.X, padx=20, pady=16)

        tk.Label(card_dev_i, text=t("desenvolvedor"),
                 bg=BG2, fg=ACCENT, font=("Segoe UI", 12, "bold")).pack(anchor="w")
        tk.Label(card_dev_i, text=f"{__author__}",
                 bg=BG2, fg=FG, font=("Segoe UI", 11)).pack(anchor="w", pady=(4, 0))
        tk.Label(card_dev_i, text=f"\U0001f4e7 {__email__}",
                 bg=BG2, fg=FG2, font=("Segoe UI", 10)).pack(anchor="w", pady=(2, 0))
        tk.Label(card_dev_i, text=f"\U0001f3e2 {__publisher__}",
                 bg=BG2, fg=FG2, font=("Segoe UI", 10)).pack(anchor="w", pady=(2, 0))

        # Card: Licença
        card_lic = tk.Frame(sobre_container, bg=BG2, highlightbackground=BORDER, highlightthickness=1)
        card_lic.pack(fill=tk.X, pady=(0, 12))
        card_lic_i = tk.Frame(card_lic, bg=BG2)
        card_lic_i.pack(fill=tk.X, padx=20, pady=16)

        tk.Label(card_lic_i, text=t("licenca_protecao"),
                 bg=BG2, fg=GREEN, font=("Segoe UI", 12, "bold")).pack(anchor="w")
        tk.Label(card_lic_i, text=f"{__copyright__}",
                 bg=BG2, fg=FG, font=("Segoe UI", 10)).pack(anchor="w", pady=(4, 0))
        tk.Label(card_lic_i, text=f"{t('licenca_label')}: {__license__}",
                 bg=BG2, fg=FG2, font=("Segoe UI", 9)).pack(anchor="w", pady=(2, 0))

        # HWID da máquina
        try:
            hwid_display = ProtecaoSoftware.obter_hwid()
        except Exception:
            hwid_display = "N/A"
        tk.Label(card_lic_i, text=f"HWID: {hwid_display}",
                 bg=BG2, fg=FG2, font=("Consolas", 9)).pack(anchor="w", pady=(8, 0))

        # Card: Aviso Legal
        card_legal = tk.Frame(sobre_container, bg=BG2, highlightbackground=RED, highlightthickness=1)
        card_legal.pack(fill=tk.X, pady=(0, 12))
        card_legal_i = tk.Frame(card_legal, bg=BG2)
        card_legal_i.pack(fill=tk.X, padx=20, pady=16)

        tk.Label(card_legal_i, text=t("aviso_legal"),
                 bg=BG2, fg=RED, font=("Segoe UI", 12, "bold")).pack(anchor="w")

        txt_aviso = tk.Text(card_legal_i, height=7, bg=BG2, fg=ORANGE,
                            font=("Segoe UI", 9), relief="flat", bd=0,
                            wrap=tk.WORD, state=tk.NORMAL, cursor="arrow",
                            highlightthickness=0)
        txt_aviso.insert("1.0", t("aviso_legal_texto").format(autor=__author__))
        txt_aviso.configure(state=tk.DISABLED)
        txt_aviso.pack(fill=tk.X, pady=(6, 0))

        # Rodapé
        tk.Label(sobre_container,
                 text=t("rodape").format(autor=__author__, publisher=__publisher__),
                 bg=BG, fg=FG2, font=("Segoe UI", 8)).pack(side=tk.BOTTOM, pady=(8, 0))

    construir_sobre()

    # ==========================================================
    # HELPERS DE GUI
    # ==========================================================
    # Estas funções são closures que capturam a referência ``janela``
    # para agendar atualizações thread-safe via after().

    # FIX 3: Rate-limit log para evitar acúmulo de callbacks no mainloop.
    # Problema original: cada _add_log chamava janela.after(0, _f)
    # individualmente, gerando milhares de callbacks enfileirados que
    # travavam a GUI. Solução: acumular msgs e fazer flush a cada 50ms.
    _log_pendente = {}       # widget_id -> lista de msgs pendentes
    _log_agendado = {}       # widget_id -> bool (já tem after pendente?)
    _LOG_LIMITE_LINHAS = 5000  # máximo de linhas no widget de log

    def _add_log(widget, msg):
        """Adiciona mensagem ao widget de log com rate-limiting.

        Mensagens são acumuladas em ``_log_pendente`` e descarregadas
        em batch a cada 50ms no máximo. Limite de 5000 linhas no widget
        para evitar consumo infinito de memória.

        Args:
            widget: Widget tk.Text onde inserir a mensagem.
            msg: String da mensagem a adicionar.
        """
        wid = id(widget)
        if wid not in _log_pendente:
            _log_pendente[wid] = []
        _log_pendente[wid].append(msg)

        if _log_agendado.get(wid):
            return  # já tem flush agendado

        def _flush():
            """Descarrega mensagens pendentes no widget de log (batch)."""
            _log_agendado[wid] = False
            msgs = _log_pendente.get(wid, [])
            if not msgs:
                return
            _log_pendente[wid] = []
            widget.configure(state=tk.NORMAL)
            widget.insert(tk.END, '\n'.join(msgs) + '\n')
            # Limitar linhas para não consumir memória infinita
            total_linhas = int(widget.index('end-1c').split('.')[0])
            if total_linhas > _LOG_LIMITE_LINHAS:
                widget.delete('1.0', f'{total_linhas - _LOG_LIMITE_LINHAS}.0')
            widget.see(tk.END)
            widget.configure(state=tk.DISABLED)

        _log_agendado[wid] = True
        janela.after(50, _flush)  # flush a cada 50ms no máximo

    def _clear_log(widget):
        """Limpa todo o conteúdo de um widget de log."""
        widget.configure(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.configure(state=tk.DISABLED)

    def _set_status(lbl, msg):
        """Atualiza texto de um label de status de forma thread-safe."""
        janela.after(0, lambda: lbl.configure(text=msg))

    def _set_barra(barra_w, v):
        """Atualiza valor de uma barra de progresso de forma thread-safe."""
        janela.after(0, lambda: barra_w.__setitem__("value", v))

    def _cleanup_zip_parcial(caminho_zip):
        """FIX 2: Remove ZIP parcial/corrompido após falha ou cancelamento."""
        try:
            cl = caminho_longo(caminho_zip)
            if os.path.exists(cl):
                os.remove(cl)
        except Exception:
            pass  # melhor deixar o arquivo do que crashar

    # ==========================================================
    # LÓGICA: COMPACTAR
    # ==========================================================
    def z_cb_prog(bfeitos, btotal, afeitos, atotal):
        """Callback de progresso da compactação — atualiza barra e status."""
        pct = (bfeitos / btotal * 100) if btotal > 0 else 100
        _set_barra(barra_zip, pct)
        _set_status(lbl_z_status,
                    t("status_progresso").format(
                        pct=f"{pct:.1f}", feitos=afeitos, total_arq=atotal,
                        feitos_tam=formatar_tamanho(bfeitos),
                        total_tam=formatar_tamanho(btotal)))

    def z_ao_terminar(res):
        """Callback executado ao término da compactação (thread → GUI)."""
        def _f():
            """Atualiza widgets da GUI no mainloop após compactação."""
            z_ativo[0] = False
            btn_z_go.configure(state=tk.NORMAL)
            btn_z_cancelar.configure(state=tk.DISABLED)
            btn_z_pasta.configure(state=tk.NORMAL)
            btn_z_arq.configure(state=tk.NORMAL)
            ent_zip_orig.configure(state=tk.NORMAL)

            if res.get("cancelado"):
                _set_status(lbl_z_status, t("cancelado"))
                _set_barra(barra_zip, 0)
                return

            if res.get("sucesso"):
                _set_barra(barra_zip, 100)
                total = formatar_tamanho(res["total_bytes"])
                zsize = formatar_tamanho(res["zip_bytes"])
                taxa = res.get("taxa_compressao", 0)
                tempo = formatar_tempo(res.get("duracao", 0))
                vel = formatar_tamanho(int(res.get("velocidade", 0)))

                _set_status(lbl_z_status,
                            t("status_zip_ok").format(
                                total=total, zsize=zsize,
                                taxa=f"{taxa:.1f}", tempo=tempo))
                _add_log(txt_z_log, f"\n{'='*50}")
                _add_log(txt_z_log, f"\u2705 ZIP: {res['destino']}")
                _add_log(txt_z_log, f"   {total}  \u2192  {zsize}")
                _add_log(txt_z_log, f"   {taxa:.1f}%  |  {vel}/s")
                _add_log(txt_z_log, f"   {tempo}  |  {res['arquivos']} files")
                if res.get("erros", 0) > 0:
                    _add_log(txt_z_log, f"   \u26a0 {res['erros']} error(s)")
                _add_log(txt_z_log, f"{'='*50}")

                messagebox.showinfo(
                    t("compactacao_concluida"),
                    t("dlg_zip_ok").format(
                        destino=res['destino'], total=total,
                        zsize=zsize, taxa=f"{taxa:.1f}", tempo=tempo))

                # Aviso de caminhos longos
                if res.get("caminhos_longos", 0) > 0:
                    messagebox.showwarning(
                        t("aviso_caminhos_longos_titulo"),
                        t("aviso_caminhos_longos").format(
                            qty=res["caminhos_longos"],
                            max=res["maior_caminho"]))
            else:
                _set_status(lbl_z_status, t("erro_compactacao"))
                _set_barra(barra_zip, 0)
        janela.after(0, _f)

    def z_iniciar():
        """Inicia o processo de compactação em thread daemon."""
        cam = var_zip_origem.get().strip().strip('"').strip("'")
        if not cam:
            messagebox.showwarning(t("aviso"), t("sel_pasta_primeiro"))
            return
        if not os.path.exists(cam) and not os.path.exists(caminho_longo(cam)):
            messagebox.showerror(t("erro"), t("caminho_nao_encontrado").format(cam=cam))
            return

        # ---- Perguntar ONDE SALVAR o ZIP ----
        nome_sug = os.path.basename(cam.rstrip(os.sep)) + ".zip"
        dir_sug = os.path.dirname(os.path.abspath(cam))
        dest = filedialog.asksaveasfilename(
            title=t("dlg_onde_salvar"),
            initialdir=dir_sug,
            initialfile=nome_sug,
            defaultextension=".zip",
            filetypes=[(t("arquivo_zip_filtro"), "*.zip"), (t("todos_filtro"), "*.*")]
        )
        if not dest:
            return

        z_ativo[0] = True
        _clear_log(txt_z_log)
        btn_z_go.configure(state=tk.DISABLED)
        btn_z_cancelar.configure(state=tk.NORMAL)
        btn_z_pasta.configure(state=tk.DISABLED)
        btn_z_arq.configure(state=tk.DISABLED)
        ent_zip_orig.configure(state=tk.DISABLED)
        _set_barra(barra_zip, 0)
        _set_status(lbl_z_status, t("iniciando_compactacao"))

        # Turbo: nível 1 (mínimo) e dobro de threads
        if var_turbo_zip.get():
            nivel_turbo = 1
            threads_turbo = max(MAX_THREADS_PADRAO * 2, 16)
        else:
            nivel_turbo = var_zip_nivel.get()
            threads_turbo = var_zip_threads.get()

        z = Zipador(
            nivel_compressao=nivel_turbo,
            num_threads=threads_turbo,
            callback_progresso=z_cb_prog,
            callback_log=lambda m: _add_log(txt_z_log, m)
        )
        ref_zip[0] = z

        def _run():
            """Thread worker: executa zipar() e trata erros/cleanup."""
            try:
                res = z.zipar(cam, dest)
                # FIX 2: Se falhou/cancelou, remover ZIP parcial corrompido
                if not res.get("sucesso"):
                    _cleanup_zip_parcial(dest)
                z_ao_terminar(res)
            except Exception as e:
                _add_log(txt_z_log, f"\u274c ERRO: {e}")
                _cleanup_zip_parcial(dest)
                z_ao_terminar({"sucesso": False})

        Thread(target=_run, daemon=True).start()

    def z_cancelar():
        """Solicita cancelamento cooperativo da compactação."""
        if ref_zip[0]:
            ref_zip[0].cancelar()
            _set_status(lbl_z_status, t("cancelando"))

    btn_z_go.configure(command=z_iniciar)
    btn_z_cancelar.configure(command=z_cancelar)

    # ==========================================================
    # LÓGICA: DESCOMPACTAR
    # ==========================================================
    def u_cb_prog(bfeitos, btotal, afeitos, atotal):
        """Callback de progresso da descompactação — atualiza barra e status."""
        pct = (bfeitos / btotal * 100) if btotal > 0 else 100
        _set_barra(barra_unzip, pct)
        _set_status(lbl_u_status,
                    t("status_progresso").format(
                        pct=f"{pct:.1f}", feitos=afeitos, total_arq=atotal,
                        feitos_tam=formatar_tamanho(bfeitos),
                        total_tam=formatar_tamanho(btotal)))

    def u_ao_terminar(res):
        """Callback executado ao término da descompactação (thread → GUI)."""
        def _f():
            """Atualiza widgets da GUI no mainloop após descompactação."""
            u_ativo[0] = False
            btn_u_go.configure(state=tk.NORMAL)
            btn_u_cancelar.configure(state=tk.DISABLED)
            btn_u_zip.configure(state=tk.NORMAL)
            ent_unzip.configure(state=tk.NORMAL)

            if res.get("cancelado"):
                _set_status(lbl_u_status, t("cancelado"))
                _set_barra(barra_unzip, 0)
                return

            if res.get("sucesso"):
                _set_barra(barra_unzip, 100)
                total = formatar_tamanho(res["total_bytes"])
                zsize = formatar_tamanho(res["zip_bytes"])
                tempo = formatar_tempo(res.get("duracao", 0))
                vel = formatar_tamanho(int(res.get("velocidade", 0)))

                _set_status(lbl_u_status,
                            t("status_unzip_ok").format(
                                arquivos=res['arquivos'], tempo=tempo))
                _add_log(txt_u_log, f"\n{'='*50}")
                _add_log(txt_u_log, f"\u2705 {res['destino']}")
                _add_log(txt_u_log, f"   {zsize}  \u2192  {total}")
                _add_log(txt_u_log, f"   {vel}/s  |  {tempo}")
                _add_log(txt_u_log, f"   {res['arquivos']} files")
                if res.get("erros", 0) > 0:
                    _add_log(txt_u_log, f"   \u26a0 {res['erros']} error(s)")
                _add_log(txt_u_log, f"{'='*50}")

                messagebox.showinfo(
                    t("descompactacao_concluida"),
                    t("dlg_unzip_ok").format(
                        destino=res['destino'], arquivos=res['arquivos'],
                        total=total, tempo=tempo))
            else:
                _set_status(lbl_u_status, t("erro_descompactacao"))
                _set_barra(barra_unzip, 0)
        janela.after(0, _f)

    def u_iniciar():
        """Inicia o processo de descompactação em thread daemon."""
        arq = var_unzip_arquivo.get().strip().strip('"').strip("'")
        if not arq:
            messagebox.showwarning(t("aviso"), t("sel_zip_primeiro"))
            return
        if not os.path.exists(arq) and not os.path.exists(caminho_longo(arq)):
            messagebox.showerror(t("erro"), t("arq_nao_encontrado").format(arq=arq))
            return

        # ---- Perguntar ONDE EXTRAIR ----
        dir_sug = os.path.dirname(os.path.abspath(arq))
        destino = filedialog.askdirectory(
            title=t("dlg_onde_extrair"),
            initialdir=dir_sug
        )
        if not destino:
            return

        u_ativo[0] = True
        _clear_log(txt_u_log)
        btn_u_go.configure(state=tk.DISABLED)
        btn_u_cancelar.configure(state=tk.NORMAL)
        btn_u_zip.configure(state=tk.DISABLED)
        ent_unzip.configure(state=tk.DISABLED)
        _set_barra(barra_unzip, 0)
        _set_status(lbl_u_status, t("iniciando_descompactacao"))

        # Turbo: dobro de threads
        if var_turbo_unzip.get():
            threads_turbo_u = max(MAX_THREADS_PADRAO * 2, 16)
        else:
            threads_turbo_u = var_unzip_threads.get()

        d = Deszipador(
            num_threads=threads_turbo_u,
            callback_progresso=u_cb_prog,
            callback_log=lambda m: _add_log(txt_u_log, m)
        )
        ref_unzip[0] = d

        def _run():
            """Thread worker: executa deszipar() e trata erros."""
            try:
                res = d.deszipar(arq, destino)
                u_ao_terminar(res)
            except Exception as e:
                _add_log(txt_u_log, f"\u274c ERRO: {e}")
                u_ao_terminar({"sucesso": False})

        Thread(target=_run, daemon=True).start()

    def u_cancelar():
        """Solicita cancelamento cooperativo da descompactação."""
        if ref_unzip[0]:
            ref_unzip[0].cancelar()
            _set_status(lbl_u_status, t("cancelando"))

    btn_u_go.configure(command=u_iniciar)
    btn_u_cancelar.configure(command=u_cancelar)

    # ==========================================================
    # TROCA DE IDIOMA
    # ==========================================================
    def atualizar_idioma(novo):
        """Atualiza TODOS os textos da interface para o idioma selecionado."""
        idioma[0] = novo
        _salvar_idioma(novo)

        # Título da janela
        janela.title(f"\u26a1 {t('titulo_app')} v{__version__}  \u2014  \u00a9 {__author__}")
        lbl_titulo.configure(text=f"\u26a1 {t('titulo_app')}")
        lbl_subtitulo.configure(text=f"{t('subtitulo')}  |  v{__version__}")

        # Abas
        notebook.tab(0, text=t("aba_compactar"))
        notebook.tab(1, text=t("aba_descompactar"))
        notebook.tab(2, text=t("aba_sobre"))

        # Aba Compactar
        lbl_o_que.configure(text=t("o_que_compactar"))
        btn_z_pasta.configure(text=t("btn_pasta"))
        btn_z_arq.configure(text=t("btn_arquivo"))
        lbl_dica_orig.configure(text=t("dica_origem"))
        lbl_config_z.configure(text=t("configuracoes"))
        lbl_nivel.configure(text=t("nivel_compressao"))
        lbl_nivel_dica.configure(text=t("nivel_dica"))
        lbl_threads_z.configure(text=t("threads"))
        btn_z_go.configure(text=t("btn_compactar"))
        btn_z_cancelar.configure(text=t("btn_cancelar"))
        chk_turbo_z.configure(text=t("modo_turbo"))
        lbl_turbo_z_dica.configure(text=t("turbo_dica"))
        if not z_ativo[0]:
            lbl_z_status.configure(text=t("pronto_compactar"))

        # Aba Descompactar
        lbl_zip_para.configure(text=t("zip_para_descompactar"))
        btn_u_zip.configure(text=t("btn_selecionar_zip"))
        lbl_dica_zip.configure(text=t("dica_zip"))
        lbl_config_u.configure(text=t("configuracoes"))
        lbl_threads_u.configure(text=t("threads"))
        btn_u_go.configure(text=t("btn_descompactar"))
        btn_u_cancelar.configure(text=t("btn_cancelar"))
        chk_turbo_u.configure(text=t("modo_turbo"))
        lbl_turbo_u_dica.configure(text=t("turbo_dica_unzip"))
        if not u_ativo[0]:
            lbl_u_status.configure(text=t("pronto_descompactar"))

        # Aba Sobre - reconstruir
        construir_sobre()

        # Destaque da bandeira ativa
        for lang, canvas in bandeiras.items():
            if lang == novo:
                canvas.configure(highlightbackground=ACCENT, highlightthickness=2)
            else:
                canvas.configure(highlightbackground=BORDER, highlightthickness=1)

    # Bind das bandeiras
    for lang, canvas in bandeiras.items():
        canvas.bind("<Button-1>", lambda e, l=lang: atualizar_idioma(l))

    # Destaque inicial da bandeira do idioma salvo
    for lang, canvas in bandeiras.items():
        if lang == idioma[0]:
            canvas.configure(highlightbackground=ACCENT, highlightthickness=2)
        else:
            canvas.configure(highlightbackground=BORDER, highlightthickness=1)

    janela.mainloop()


# ============================================================
# INICIAR
# ============================================================
if __name__ == '__main__':
    iniciar_gui()
