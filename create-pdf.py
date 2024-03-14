import os
import re

import click
from PIL import Image
from reportlab.pdfgen import canvas



def convert_images_to_pdf(image_paths, output_pdf_path):
    c = canvas.Canvas(output_pdf_path)
    for image_path in image_paths:
        img = Image.open(image_path)
        img_width, img_height = img.size
        width_in_points = img_width * 72 / 96
        height_in_points = img_height * 72 / 96

        c.setPageSize((width_in_points, height_in_points))
        c.drawImage(image_path, 0, 0, width=width_in_points, height=height_in_points)
        c.showPage()

    c.save()
def url_to_safe_string(url: str) -> str:
    return re.sub(r"[^\w\d.]+", "_", url)

@click.command()
@click.argument("url", type=str,required=True)
def main(url):
    safe_str = url_to_safe_string(url)
    capture_folder = os.path.join("captures", safe_str)
    out_file = os.path.join("pdfs", safe_str+".pdf")
    files = list(os.listdir(capture_folder))
    max_slide = -1
    for file in files:
        try:
            no = int(os.path.splitext(file)[0])
            max_slide = max(max_slide, no)
        except:
            pass
    num_slides = max_slide + 1
    image_filenames = []
    for slide_number in range(num_slides):
        main_slide = f"{slide_number}.png"
        diagram_slide = f"{slide_number}-diagram.png"
        if main_slide in files:
            image_filenames.append(main_slide)
        if diagram_slide in files:
            image_filenames.append(diagram_slide)
    image_paths = [os.path.join(capture_folder,image_filename) for image_filename in image_filenames]
    convert_images_to_pdf(image_paths,out_file)
            

if __name__ == "__main__":
    main()