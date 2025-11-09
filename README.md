🌌 Simulador do Sistema Solar em Python
Um simulador interativo do sistema solar desenvolvido em Python usando Pygame, com planetas em movimento orbital e controles de velocidade.

✨ Características
Planetas em movimento orbital com velocidades realistas

Imagens reais dos planetas

Controles interativos de velocidade e pausa

Visualização em tempo real das órbitas

Interface limpa e informativa

🛠️ Tecnologias Utilizadas
Python 3.8+

Pygame

NumPy

📋 Pré-requisitos
Python 3.8 ou superior instalado

Pip (gerenciador de pacotes do Python)

🚀 Instalação e Execução
1. Baixe e extraia os arquivos do projeto
2. Navegue até a pasta do projeto
bash
cd solar
3. (Opcional) Crie um ambiente virtual
bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
4. Instale as dependências
bash
pip install -r requirements.txt
5. Execute o projeto
bash
python src/main.py
🎮 Controles
Tecla	Ação
+ ou =	Aumentar velocidade
-	Diminuir velocidade
ESPAÇO	Pausar/Continuar simulação
R	Resetar simulação
1	Velocidade muito lenta (0.1x)
2	Velocidade normal (1.0x)
3	Velocidade rápida (3.0x)
4	Velocidade máxima (10.0x)
ESC	Sair do simulador
📁 Estrutura do Projeto
text
solar/
├── README.md
├── requirements.txt
├── assets/
│   ├── sun.png
│   ├── mercury.png
│   ├── venus.png
│   ├── earth.png
│   ├── mars.png
│   ├── jupiter.png
│   ├── saturn.png
│   ├── uranus.png
│   └── neptune.png
└── src/
    ├── main.py
    ├── solar_system.py
    ├── planet.py
    └── constants.py
🔧 Solução de Problemas
Erro: "ModuleNotFoundError: No module named 'pygame'"
bash
pip install pygame
As imagens não carregam
Verifique se a pasta assets/ contém todas as imagens dos planetas

Os nomes devem ser exatos: sun.png, earth.png, etc.

Erro de execução
Certifique-se de executar da pasta raiz do projeto

Verifique se está usando Python 3.8+

📄 Licença
Este projeto está sob a licença MIT.