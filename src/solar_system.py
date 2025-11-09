import pygame
import os
from planet import Planet
import constants as const


class SolarSystem:
    def __init__(self, width, height):
        self.width = width
        self.height = height
        self.center_x = width // 2
        self.center_y = height // 2
        self.planets = []
        self.sun_radius = const.PLANET_SIZES['sun']  # Usa tamanho da constante
        self.font = pygame.font.SysFont('Arial', 16)

        self._create_planets()
        self._create_stars()

    def _create_planets(self):
        planets_data = [
            ("Mercúrio", const.PLANET_SIZES['mercury'], const.GRAY,
             const.ORBITAL_DISTANCES['mercury'], 0.04, const.IMAGE_PATHS['mercury']),

            ("Vênus", const.PLANET_SIZES['venus'], const.ORANGE,
             const.ORBITAL_DISTANCES['venus'], 0.015, const.IMAGE_PATHS['venus']),

            ("Terra", const.PLANET_SIZES['earth'], const.BLUE,
             const.ORBITAL_DISTANCES['earth'], 0.01, const.IMAGE_PATHS['earth']),

            ("Marte", const.PLANET_SIZES['mars'], const.RED,
             const.ORBITAL_DISTANCES['mars'], 0.008, const.IMAGE_PATHS['mars']),

            ("Júpiter", const.PLANET_SIZES['jupiter'], const.ORANGE,
             const.ORBITAL_DISTANCES['jupiter'], 0.004, const.IMAGE_PATHS['jupiter']),

            ("Saturno", const.PLANET_SIZES['saturn'], const.YELLOW,
             const.ORBITAL_DISTANCES['saturn'], 0.003, const.IMAGE_PATHS['saturn']),

            ("Urano", const.PLANET_SIZES['uranus'], const.DARK_BLUE,
             const.ORBITAL_DISTANCES['uranus'], 0.002, const.IMAGE_PATHS['uranus']),

            ("Netuno", const.PLANET_SIZES['neptune'], const.BLUE,
             const.ORBITAL_DISTANCES['neptune'], 0.001, const.IMAGE_PATHS['neptune'])
        ]

        for name, radius, color, distance, speed, image_path in planets_data:
            if os.path.exists(image_path):
                planet = Planet(name, radius, color,
                                distance, speed, image_path)
            else:
                planet = Planet(name, radius, color, distance, speed)
            self.planets.append(planet)

    def _create_stars(self):
        import random
        self.stars = []
        # Mais estrelas para tela maior
        for _ in range(200):
            x = random.randint(0, self.width)
            y = random.randint(0, self.height)
            brightness = random.randint(100, 255)
            size = random.choice([1, 1, 1, 2])  # Algumas estrelas maiores
            self.stars.append((x, y, brightness, size))

    def draw_stars(self, screen):
        for x, y, brightness, size in self.stars:
            color = (brightness, brightness, brightness)
            pygame.draw.circle(screen, color, (x, y), size)

    def update(self):
        for planet in self.planets:
            planet.update()

    def draw(self, screen):
        # Fundo com estrelas
        screen.fill((0, 0, 0))
        self.draw_stars(screen)

        # Desenhar Sol
        sun_image_path = const.IMAGE_PATHS['sun']
        if os.path.exists(sun_image_path):
            try:
                sun_image = pygame.image.load(sun_image_path)
                sun_image = pygame.transform.scale(
                    sun_image, (self.sun_radius*2, self.sun_radius*2))
                screen.blit(sun_image, (self.center_x - self.sun_radius,
                                        self.center_y - self.sun_radius))
            except Exception as e:
                pygame.draw.circle(screen, const.YELLOW,
                                   (self.center_x, self.center_y), self.sun_radius)
        else:
            pygame.draw.circle(screen, const.YELLOW,
                               (self.center_x, self.center_y), self.sun_radius)

        # Desenhar planetas
        for planet in self.planets:
            planet.draw(screen, self.center_x, self.center_y)

        # Informações

    def draw_info(self, screen):
        info_text = [
            "Controles: +/= Aumentar   - Diminuir   ESPAÇO Pausar   R Resetar",
            "Sistema Solar - Projeto Python"
        ]

        for i, text in enumerate(info_text):
            rendered = self.font.render(text, True, const.WHITE)
            screen.blit(rendered, (10, 10 + i*20))
