const jimp = require("jimp");
const sizeOf = require("util").promisify(require("image-size"));
const fs = require("fs");
const rangeParser = require("parse-numeric-range");

const card_w = 750;
const card_h = 1050;
const card_ratio = 1050 / 750;
const page_w = 2480;
const page_h = 3508;
const layout_w = card_w * 3;
const layout_h = card_h * 3;
const layout_offsetX = (page_w - layout_w) / 2;
const layout_offsetY = (page_h - layout_h) / 2;

async function cut(infile, outpath, x, y, skip) {
  const fileName = infile.split("/").pop().split(".")[0];
  const dimensions = await sizeOf(infile);
  console.log(`Size: ${dimensions.width}, ${dimensions.height}`);
  const eachX = Math.floor(dimensions.width / x);
  const eachY = Math.floor(dimensions.height / y);
  const positions = Array.from(Array(x * y).keys());
  const crops = await Promise.all(
    positions.map(async (idx) => {
      if (skip.has(idx)) {
        console.log(`Skipped ${idx}`);
        return [];
      }
      const j = Math.floor(idx / x);
      const i = idx - y * j;
      console.log(`Crop ${idx} from ${eachX * i}, ${eachY * j}`);
      const image = await jimp.read(infile);
      try {
        const crop = image.crop(eachX * i, eachY * j, eachX, eachY);
        const outFile = `${outpath}/raw/${fileName}-${i}-${j}.${image.getExtension()}`;
        await crop.writeAsync(outFile);
        return [outFile];
      } catch (err) {
        console.log(`FAILED ${idx} ${err}`);
        return [];
      }
    })
  );
  return crops.flat();
}

async function resize(crops, outpath) {
  const resizes = [];
  return Promise.all(
    crops.map(async (infile) => {
      const image = await jimp.read(infile);
      const file = infile.split("/").pop();
      const dimensions = await sizeOf(infile);
      const file_ratio = dimensions.height / dimensions.width;
      const [w, h] =
        file_ratio > card_ratio
          ? [card_h / file_ratio, card_h]
          : [card_w, card_w * file_ratio];
      console.log(`Resize ${file} to [${w}, ${h}]`);
      const resize = image.resize(w, h);
      const outFile = `${outpath}/resize/${file}`;
      await resize.writeAsync(outFile);
      return outFile;
    })
  );
}

function chunk(array, size) {
  const chunked_arr = [];
  let index = 0;
  while (index < array.length) {
    chunked_arr.push(array.slice(index, size + index));
    index += size;
  }
  return chunked_arr;
}

async function layoutCards(resizes, outpath) {
  resizes.sort(function (a, b) {
    return a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
  const chunked = chunk(resizes, 9);
  return await Promise.all(
    chunked.map(async (chunk, idx) => {
      console.log(`Layout ${idx}: ${chunk.length}`);
      const compositions = await Promise.all(
        chunk.map(async (file, inner) => {
          // console.log(`At ${idx}-${inner}: ${file}`);
          const j = Math.floor(inner / 3);
          const i = inner - 3 * j;
          const x = layout_offsetX + card_w * i;
          const y = layout_offsetY + card_h * j;
          const dimensions = await sizeOf(file);
          const offsetX = (card_w - dimensions.width) / 2;
          const offsetY = (card_h - dimensions.height) / 2;
          console.log(
            `At ${idx}-${inner}: pos [${i}, ${j}], posPx: [${x}, ${y}], size: [${dimensions.width}, ${dimensions.height}], offset: [${offsetX}, ${offsetY}]`
          );
          const image = await jimp.read(file);
          const card = new jimp(card_w, card_h, "#ff00ff");
          card.composite(image, offsetX, offsetY);
          return [card, x, y];
        })
      );
      const cards = new jimp(page_w, page_h, "#ffffff");
      compositions.forEach(([image, x, y]) => cards.composite(image, x, y));
      const line_v = new jimp(1, 30, "#ff00ff");
      const line_h = new jimp(30, 1, "#ff00ff");
      for (offset = 0; offset < 4; offset++) {
        cards.composite(line_v, layout_offsetX + (card_w * offset), layout_offsetY - 30);
        cards.composite(line_v, layout_offsetX + (card_w * offset), page_h - layout_offsetY);

        cards.composite(line_h, layout_offsetX - 30, layout_offsetY + (card_h * offset));
        cards.composite(line_h, page_w - layout_offsetX, layout_offsetY + (card_h * offset));
      }
      const outCards = `${outpath}/cards/page${idx}.${cards.getExtension()}`;
      await cards.writeAsync(outCards);
      return outCards;
    })
  );
}

async function start() {
  const x = process.argv[2];
  const y = process.argv[3];
  const outpath = process.argv[4];
  const infile = process.argv[5];
  const skip = new Set(rangeParser(process.argv[6] ?? ""));
  console.log(`Cutting ${infile} in ${x}x${y} to ${outpath}`);
  console.log(`Skips: ${[...skip]}`);
  const crops = await cut(infile, outpath, x, y, skip);
  const resizes = await resize(crops, outpath);
  const cards = await layoutCards(resizes, outpath);
  console.log(Array.from(cards));
}

// node index.js 10 1 ./out file.ext
start();
