import pygame
import sys
import os

# Adiciona o diretório atual ao path para importar outros módulos
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

try:
    from solar_system import SolarSystem
    print("Sistema Solar - Python | Controles: +/- Velocidade | ESPACO Pausar | R Resetar")
except ImportError as e:
    print(f"Erro na importacao: {e}")
    sys.exit(1)


class Simulation:
    def __init__(self):
        pygame.init()
        self.width, self.height = 1400, 900
        self.screen = pygame.display.set_mode((self.width, self.height))
        pygame.display.set_caption("Sistema Solar - Python")

        self.solar_system = SolarSystem(self.width, self.height)
        self.clock = pygame.time.Clock()
        self.running = True
        self.paused = False

        # Velocidades base e multiplicador separado
        self.speed_multiplier = 1.0
        self.base_speeds = self._get_base_speeds()

    def _get_base_speeds(self):
        """Obtem as velocidades originais dos planetas"""
        return [planet.speed for planet in self.solar_system.planets]

    def _apply_speed_multiplier(self):
        """Aplica o multiplicador as velocidades base"""
        for i, planet in enumerate(self.solar_system.planets):
            planet.speed = self.base_speeds[i] * self.speed_multiplier

    def handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self.running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_SPACE:
                    self.paused = not self.paused
                elif event.key == pygame.K_r:
                    # Resetar simulacao
                    self.solar_system = SolarSystem(self.width, self.height)
                    self.speed_multiplier = 1.0
                    self.base_speeds = self._get_base_speeds()
                elif event.key == pygame.K_ESCAPE:
                    self.running = False

                # CONTROLES DE VELOCIDADE COM VALORES FIXOS
                elif event.key == pygame.K_PLUS or event.key == pygame.K_EQUALS:
                    # Aumenta velocidade em passos fixos
                    if self.speed_multiplier < 10.0:
                        self.speed_multiplier += 0.5
                        self._apply_speed_multiplier()

                elif event.key == pygame.K_MINUS:
                    # Diminui velocidade em passos fixos
                    if self.speed_multiplier > 0.1:
                        self.speed_multiplier -= 0.5
                        self._apply_speed_multiplier()

                # VELOCIDADES PRE-DEFINIDAS
                elif event.key == pygame.K_1:
                    self.speed_multiplier = 0.1
                    self._apply_speed_multiplier()
                elif event.key == pygame.K_2:
                    self.speed_multiplier = 1.0
                    self._apply_speed_multiplier()
                elif event.key == pygame.K_3:
                    self.speed_multiplier = 3.0
                    self._apply_speed_multiplier()
                elif event.key == pygame.K_4:
                    self.speed_multiplier = 10.0
                    self._apply_speed_multiplier()

    def update(self):
        if not self.paused:
            self.solar_system.update()

    def draw(self):
        self.solar_system.draw(self.screen)

        # Fonte para os textos
        font_large = pygame.font.SysFont('Arial', 28)
        font_small = pygame.font.SysFont('Arial', 18)

        # TITULO - Canto superior esquerdo
        title_text = font_large.render("Sistema Solar", True, (255, 255, 255))
        self.screen.blit(title_text, (20, 20))

        # CONTROLES - Abaixo do titulo
        controls_lines = [
            "Controles de velocidade: +/-",
            "ESPACO : Pausar/Continuar",
            "R : Resetar"
        ]

        for i, line in enumerate(controls_lines):
            control_text = font_small.render(line, True, (200, 200, 200))
            self.screen.blit(control_text, (20, 60 + i*25))

        # VELOCIDADE - Canto superior direito
        status = f"VELOCIDADE: {self.speed_multiplier:.1f}x"
        if self.paused:
            status = "PAUSADO"

        status_text = font_large.render(status, True, (255, 255, 255))
        status_rect = status_text.get_rect()
        status_rect.topright = (self.width - 20, 20)
        self.screen.blit(status_text, status_rect)

        pygame.display.flip()

    def run(self):
        while self.running:
            self.handle_events()
            self.update()
            self.draw()
            self.clock.tick(60)

        pygame.quit()
        sys.exit()


if __name__ == "__main__":
    simulation = Simulation()
    simulation.run()
