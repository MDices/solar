import pygame
import math


class Planet:
    def __init__(self, name, radius, color, distance, speed, image_path=None):
        self.name = name
        self.radius = radius
        self.color = color
        self.distance = distance  # Distância do Sol
        self.speed = speed        # Velocidade angular
        self.angle = 0
        self.image = None

        if image_path:
            try:
                self.image = pygame.image.load(image_path)
                self.image = pygame.transform.scale(
                    self.image, (radius*2, radius*2))
            except:
                print(f"Erro ao carregar imagem para {name}")

    def update(self):
        self.angle += self.speed

    def get_position(self, center_x, center_y):
        x = center_x + self.distance * math.cos(self.angle)
        y = center_y + self.distance * math.sin(self.angle)
        return (x, y)

    def draw(self, screen, center_x, center_y):
        x, y = self.get_position(center_x, center_y)

        # Desenhar órbita (trajetória)
        pygame.draw.circle(screen, (50, 50, 50),
                           (center_x, center_y), self.distance, 1)

        # Desenhar planeta
        if self.image:
            screen.blit(self.image, (x - self.radius, y - self.radius))
        else:
            pygame.draw.circle(screen, self.color,
                               (int(x), int(y)), self.radius)

        # Desenhar anéis para Saturno
        if self.name == "Saturno":
            ring_radius = self.radius * 2
            pygame.draw.ellipse(screen, (200, 200, 150),
                                (x - ring_radius, y - self.radius//2,
                                ring_radius*2, self.radius), 2)
