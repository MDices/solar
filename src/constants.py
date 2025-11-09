# Cores
import os
WHITE = (255, 255, 255)
YELLOW = (255, 255, 0)
GRAY = (200, 200, 200)
BROWN = (165, 42, 42)
RED = (255, 0, 0)
ORANGE = (255, 165, 0)
BLUE = (0, 0, 255)
DARK_BLUE = (0, 0, 139)


# Obtém o diretório base do projeto (onde está assets/)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Caminhos ABSOLUTOS das imagens
IMAGE_PATHS = {
    'sun': os.path.join(BASE_DIR, 'assets', 'sun.png'),
    'mercury': os.path.join(BASE_DIR, 'assets', 'mercury.png'),
    'venus': os.path.join(BASE_DIR, 'assets', 'venus.png'),
    'earth': os.path.join(BASE_DIR, 'assets', 'earth.png'),
    'mars': os.path.join(BASE_DIR, 'assets', 'mars.png'),
    'jupiter': os.path.join(BASE_DIR, 'assets', 'jupiter.png'),
    'saturn': os.path.join(BASE_DIR, 'assets', 'saturn.png'),
    'uranus': os.path.join(BASE_DIR, 'assets', 'uranus.png'),
    'neptune': os.path.join(BASE_DIR, 'assets', 'neptune.png')
}

# Tamanhos dos planetas (em pixels)
PLANET_SIZES = {
    'sun': 80,
    'mercury': 15,
    'venus': 22,
    'earth': 24,
    'mars': 18,
    'jupiter': 50,
    'saturn': 45,
    'uranus': 32,
    'neptune': 32
}

# Distâncias orbitais
ORBITAL_DISTANCES = {
    'mercury': 120,
    'venus': 180,
    'earth': 240,
    'mars': 300,
    'jupiter': 400,
    'saturn': 500,
    'uranus': 600,
    'neptune': 700
}
