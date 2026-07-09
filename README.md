# Jianzhu Guo's homepage

Personal academic homepage built with Jekyll and hosted on GitHub Pages at
[guojianzhu.com](https://guojianzhu.com).

The design is adapted from [Jon Barron's website](https://jonbarron.info/) and
the repository started from [Jekyll Now](https://github.com/barryclark/jekyll-now).
The template may be reused, but the content and media in `assets/` and `_posts/`
remain the property of their respective owners.

## Local development

Use Ruby 3.3 and Bundler. `Gemfile` pins the GitHub Pages runtime used by this
repository; `Gemfile.lock` stays local as recommended for branch-based Pages sites.

```sh
bundle install
bundle exec jekyll serve
```

Then open <http://127.0.0.1:4000>.

For a production build:

```sh
bundle exec jekyll build
```

## Updating content

- Site metadata lives in `_config.yml`.
- The homepage structure lives in `_layouts/default.html`.
- Publications, projects, news, and competitions live in `_posts/` and are
  selected by their `categories` front matter.
- Images, PDFs, videos, and scripts live under `assets/`.

Each post also receives its own date-based URL. Keep `date` values in UTC; the
site timezone is fixed in `_config.yml` so local and GitHub Pages builds agree.
