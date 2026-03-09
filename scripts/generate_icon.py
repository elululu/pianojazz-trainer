from math import sqrt
from pathlib import Path


SIZE = 1024
BG_START = (9, 11, 18)
BG_END = (36, 18, 56)
GOLD = (245, 196, 92)
CREAM = (248, 242, 230)
BLUE = (83, 168, 255)
SHADOW = (18, 22, 34)


def mix(left: tuple[int, int, int], right: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
	clamped = max(0.0, min(1.0, amount))
	return tuple(int(left[index] * (1 - clamped) + right[index] * clamped) for index in range(3))


def set_pixel(image: bytearray, x: int, y: int, color: tuple[int, int, int]) -> None:
	if 0 <= x < SIZE and 0 <= y < SIZE:
		pixel_index = (y * SIZE + x) * 3
		image[pixel_index : pixel_index + 3] = bytes(color)


def main() -> None:
	image = bytearray(SIZE * SIZE * 3)

	for y in range(SIZE):
		for x in range(SIZE):
			dx = (x - SIZE / 2) / SIZE
			dy = (y - SIZE / 2) / SIZE
			radial = min(1.0, sqrt(dx * dx + dy * dy) * 1.65)
			vertical = y / (SIZE - 1)
			color = mix(BG_START, BG_END, 0.55 * vertical + 0.45 * (1 - radial))

			if y > SIZE * 0.72:
				glow = min(1.0, (y - SIZE * 0.72) / (SIZE * 0.28))
				color = mix(color, (17, 61, 96), glow * 0.55)

			set_pixel(image, x, y, color)

	center_x = SIZE // 2
	center_y = SIZE // 2
	outer_radius = 430

	for y in range(SIZE):
		for x in range(SIZE):
			dx = x - center_x
			dy = y - center_y + 28
			distance = sqrt(dx * dx + dy * dy)

			if distance < outer_radius:
				rim = max(0.0, min(1.0, (outer_radius - distance) / 28))
				pixel_index = (y * SIZE + x) * 3
				base = tuple(image[pixel_index + channel] for channel in range(3))
				tint_amount = 0.28 + 0.24 * (1 - distance / outer_radius)
				tint = mix((54, 26, 76), (16, 22, 30), distance / outer_radius)
				color = mix(base, tint, tint_amount)

				if rim > 0.82:
					color = mix(color, GOLD, (rim - 0.82) * 2.8)

				image[pixel_index : pixel_index + 3] = bytes(color)

	key_top = 290
	key_bottom = 760
	white_key_width = 86
	start_x = center_x - white_key_width * 4

	for key_index in range(8):
		key_x = start_x + key_index * white_key_width

		for y in range(key_top, key_bottom):
			for x in range(key_x, key_x + white_key_width - 6):
				edge_distance = min(x - key_x, key_x + white_key_width - 7 - x, y - key_top, key_bottom - 1 - y)
				shade = 0.10 if edge_distance < 4 else 0.0
				color = mix(CREAM, (225, 218, 210), shade)

				if y > key_bottom - 58:
					color = mix(color, GOLD, 0.16)

				set_pixel(image, x, y, color)

	for key_index in [0, 1, 3, 4, 5]:
		key_x = start_x + int((key_index + 0.7) * white_key_width)
		black_key_width = 54
		black_key_height = 290

		for y in range(key_top, key_top + black_key_height):
			for x in range(key_x, key_x + black_key_width):
				edge = min(x - key_x, key_x + black_key_width - 1 - x)
				highlight = max(0.0, 1 - edge / 14)
				color = mix(SHADOW, (50, 54, 69), y / (key_top + black_key_height))
				color = mix(color, (80, 86, 110), highlight * 0.18)
				set_pixel(image, x, y, color)

	for y in range(SIZE):
		for x in range(SIZE):
			dx = x - 726
			dy = y - 308

			if dx * dx + dy * dy < 54 * 54:
				set_pixel(image, x, y, GOLD)

	for y in range(324, 655):
		stem_half_width = 26
		x_center = 725 + int(18 * ((y - 324) / 331))

		for x in range(x_center - stem_half_width, x_center + stem_half_width):
			if (x - x_center) ** 2 < stem_half_width**2:
				set_pixel(image, x, y, GOLD)

	for y in range(SIZE):
		for x in range(SIZE):
			curve = 0.0017 * (x - 615) ** 2 + 548

			if 0 < y - curve < 30 and 600 < x < 850:
				glow = 1 - min(1.0, abs(y - curve - 15) / 15)
				set_pixel(image, x, y, mix(GOLD, BLUE, 0.18 * (1 - glow)))

	assets_dir = Path(__file__).resolve().parent.parent / 'assets'
	assets_dir.mkdir(parents=True, exist_ok=True)

	with (assets_dir / 'icon-source.ppm').open('wb') as file:
		file.write(f'P6\n{SIZE} {SIZE}\n255\n'.encode())
		file.write(image)


if __name__ == '__main__':
	main()
