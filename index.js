const jimp = require("jimp");
const sizeOf = require("util").promisify(require("image-size"));
const readDir = require("util").promisify(require("fs").readdir);
const rangeParser = require("parse-numeric-range");
const path = require("path");

const card_w = 750;
const card_h = 1050;
const card_ratio = card_h / card_w;
const card_margin = 5;
const card_w_b = card_w + (2 * card_margin);
const card_h_b = card_h + (2 * card_margin);
const page_w = 2480;
const page_h = 3508;
const layout_w = card_w_b * 3;
const layout_h = card_h_b * 3;
const layout_offsetX = (page_w - layout_w) / 2;
const layout_offsetY = (page_h - layout_h) / 2;

async function cut(infile, outpath, x, y, t, l, skip) {
  const fileName = infile.split("/").pop().split(".")[0];
  const dimensions = await sizeOf(infile);
  console.log(`Size real: ${dimensions.width}, ${dimensions.height}`);
  const width = Math.floor(dimensions.width - (2 * l));
  const height = Math.floor(dimensions.height - (2 * t));
  console.log(`Size crop: ${width}, ${height}`);
  const eachX = Math.floor(width / x);
  const eachY = Math.floor(height / y);
  const positions = Array.from(Array(x * y).keys());
  const crops = await Promise.all(
    positions.map(async (idx) => {
      if (skip.has(idx)) {
        console.log(`Skipped ${idx}`);
        return [];
      }
      const j = Math.floor(idx / x);
      const i = idx - (x * j);
      const cropName = `${fileName}-r${j + 1}-c${i + 1}`;
      console.log(`Crop ${cropName} at ${idx} from ${eachX * i + l}, ${eachY * j + t}`);
      const image = await jimp.read(infile);
      try {
        const crop = image.crop((eachX * i) + l, (eachY * j) + t, eachX, eachY);
        const outFile = `${outpath}/raw/${cropName}.${image.getExtension()}`;
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
  resizes.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  const chunked = chunk(resizes, 9);
  return await Promise.all(
    chunked.map(async (chunk, idx) => {
      console.log(`Layout ${idx}: ${chunk.length}`);
      const compositions = await Promise.all(
        chunk.map(async (file, inner) => {
          // console.log(`At ${idx}-${inner}: ${file}`);
          const j = Math.floor(inner / 3);
          const i = inner - 3 * j;
          const x = layout_offsetX + card_w_b * i;
          const y = layout_offsetY + card_h_b * j;
          const dimensions = await sizeOf(file);
          const offsetX = (card_w_b - dimensions.width) / 2;
          const offsetY = (card_h_b - dimensions.height) / 2;
          console.log(
            `At ${idx}-${inner}: pos [${i}, ${j}], posPx: [${x}, ${y}], size: [${dimensions.width}, ${dimensions.height}], offset: [${offsetX}, ${offsetY}]`
          );
          const image = await jimp.read(file);
          const card = new jimp(card_w_b, card_h_b, "#000000");
          card.composite(image, offsetX, offsetY);
          return [card, x, y];
        })
      );
      const cards = new jimp(page_w, page_h, "#ffffff");
      compositions.forEach(([image, x, y]) => cards.composite(image, x, y));
      const line_v = new jimp(1, 30, "#ff00ff");
      const line_h = new jimp(30, 1, "#ff00ff");
      for (offset = 0; offset < 4; offset++) {
        cards.composite(
          line_v,
          layout_offsetX + card_w_b * offset,
          layout_offsetY - 30
        );
        cards.composite(
          line_v,
          layout_offsetX + card_w_b * offset,
          page_h - layout_offsetY
        );

        cards.composite(
          line_h,
          layout_offsetX - 30,
          layout_offsetY + card_h_b * offset
        );
        cards.composite(
          line_h,
          page_w - layout_offsetX,
          layout_offsetY + card_h_b * offset
        );
      }
      const outCards = `${outpath}/cards/page${idx}.${cards.getExtension()}`;
      await cards.writeAsync(outCards);
      return outCards;
    })
  );
}

async function withCrop() {
  const x = parseInt(process.argv[3]);
  const y = parseInt(process.argv[4]);
  const top = parseInt(process.argv[5]);
  const left = parseInt(process.argv[6]);
  const skip = new Set(rangeParser(process.argv[7]));
  const outpath = process.argv[8];
  const infile = process.argv[9];
  console.log(`Cutting ${infile} in ${x}x${y} with margins [${top}, ${left}] to ${outpath}`);
  console.log(`Skips: ${[...skip]}`);
  const crops = await cut(infile, outpath, x, y, top, left, skip);
  return [crops, outpath];
}

async function withFolder() {
  const outpath = process.argv[3];
  const infolder = process.argv[4];
  const route = path.resolve(process.cwd(), infolder);
  const files = await readDir(route);
  const filesAbs = files.map((file) => path.resolve(route, file)).filter((file) => file.indexOf('DS_Store') === -1);
  return [filesAbs, outpath];
}

async function start() {
  let crops;
  let outpath;
  if (process.argv[2] === "crop") {
    await withCrop();
  } else if (process.argv[2] === "join") {
    [crops, outpath] = await withFolder();
    const resizes = await resize(crops, outpath);
    const cards = await layoutCards(resizes, outpath);
    console.log(Array.from(cards));
  } else {
    console.log("Crop or join, decide");
  }
}

// node index.js crop 10 2 0 0 '3-5' ./out file.ext
// node index.js join ./out folder
start();
