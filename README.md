[Apache 2 License](./LICENSE)

# PnPCut

Do you have a file or folder containing a buncha cards, and you'd like them nicely lined up as standard cards on a 3x3 grid on an A4 with safety margins and cutting guides? So did I!

This script is some crap I wrote on a lazy Saturday. Don't judge.

## Usage

To crop a file

```
node index.js crop 10 2 0 0 '3-5' ./out file
```

Where `crop` is followed by number of columns, number of rows, margin from the top and bottom to skip, a [range string](https://github.com/euank/node-parse-numeric-range) of spaces to ignore (i.e. gaps at the end of the file), the folder where the pages are going to be output, and the file to crop.

To join the files on a folder

```
node index.js join ./out folder
```

Where the first parameter is the folder where the pages are going to be, and the folder where to find the cards.

Some values such as the margin color and size can be configured in `index.js`

## Example

![](https://i.imgur.com/cGii4rn.png)
